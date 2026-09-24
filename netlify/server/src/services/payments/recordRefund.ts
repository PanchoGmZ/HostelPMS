import { getFirebaseAdmin } from '../../firebase/admin';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import type { AuthContext } from '../../auth/verifyAuth';
import * as crypto from 'crypto';

export interface RecordRefundPayload {
  establishmentId: string;
  stayId: string;
  paymentId: string;
  amount: number;
}

export interface RecordRefundResult {
  success: true;
  message: string;
  refundId: string;
}

export class RefundError extends Error {
  constructor(message: string, public readonly httpStatus: number = 400) {
    super(message);
    this.name = 'RefundError';
  }
}

export async function recordRefundService(
  payload: RecordRefundPayload,
  auth: AuthContext
): Promise<RecordRefundResult> {
  getFirebaseAdmin();
  const db = getFirestore();

  const { establishmentId, stayId, paymentId, amount } = payload;

  if (!establishmentId || !stayId || !paymentId || typeof amount !== 'number') {
    throw new RefundError('Parámetros inválidos.');
  }

  if (amount <= 0) {
    throw new RefundError('El monto debe ser mayor a 0.');
  }

  if (!auth.roles[establishmentId]) {
    throw new RefundError('No tienes permisos.', 403);
  }

  const estRef = db.collection('establishments').doc(establishmentId);
  const stayRef = estRef.collection('stays').doc(stayId);

  let finalRefundId = '';

  try {
    await db.runTransaction(async (transaction) => {
      // ── PHASE 1: ALL READS ──────────────────────────────────────────

      const staySnap = await transaction.get(stayRef);
      if (!staySnap.exists) {
        throw new RefundError('La estadía no existe.', 404);
      }

      const foliosSnap = await transaction.get(
        estRef.collection('folios').where('stayId', '==', stayId).limit(1)
      );
      if (foliosSnap.empty) {
        throw new RefundError('No existe folio para esta estadía.', 500);
      }

      const cashShiftsSnap = await transaction.get(
        estRef.collection('cashShifts').where('status', '==', 'open').limit(1)
      );

      // ── PHASE 2: CALCULATIONS & WRITES ──────────────────────────────

      const folioRef = foliosSnap.docs[0].ref;
      const folioData = foliosSnap.docs[0].data();
      const payments = folioData.payments || [];

      // 1. Encontrar el pago original
      const originalPayment = payments.find((p: any) => p.id === paymentId);
      if (!originalPayment) {
        throw new RefundError('El pago original no existe en este folio.', 404);
      }

      // 2. Calcular reembolsos previos vinculados a este pago
      // En vez de depender de la descripción de texto, usamos la relación estricta
      const previousRefundsTotal = payments
        .filter((p: any) => p.relatedPaymentId === paymentId)
        .reduce((sum: number, p: any) => sum + Math.abs(p.amount), 0);

      // 3. Validar que no se exceda el monto pagado
      const availableToRefund = originalPayment.amount - previousRefundsTotal;
      if (amount > availableToRefund) {
        throw new RefundError(`El monto del reembolso excede el saldo reembolsable disponible (${availableToRefund}).`);
      }

      const refundId = crypto.randomUUID();
      finalRefundId = refundId;

      const updatedPayments = [
        ...payments,
        {
          id: refundId,
          relatedPaymentId: paymentId,
          amount: -amount,
          method: 'refund',
          originalMethod: originalPayment.method || null,
          status: 'completed',
          reference: `Reembolso de ${paymentId}`,
          currencyCode: originalPayment.currencyCode || 'BOB',
          receivedAmount: -amount,
          createdAt: Timestamp.now(),
        },
      ];

      const newTotalPaid = (folioData.totalPaid || 0) - amount;
      const newBalance = newTotalPaid - (folioData.totalCharges || 0);

      transaction.update(folioRef, {
        payments: updatedPayments,
        totalPaid: newTotalPaid,
        balance: newBalance,
        updatedAt: FieldValue.serverTimestamp(),
      });

      // Crear movimiento de caja si hay turno abierto (Corrigiendo el bug original)
      if (!cashShiftsSnap.empty) {
        const cashShiftRef = cashShiftsSnap.docs[0].ref;
        const movementRef = cashShiftRef.collection('movements').doc();
        
        transaction.set(movementRef, {
          type: 'out', // Egreso de dinero (refund)
          amount: amount, // Monto positivo para el egreso (así funciona el frontend)
          method: originalPayment.method || 'cash', // HEREDA el método original (muy importante)
          currencyCode: originalPayment.currencyCode || 'BOB',
          receivedAmount: amount, // Positive amount for the out movement
          description: `Reembolso de folio - ${stayId}`,
          relatedFolioId: folioRef.id,
          relatedPaymentId: refundId,
          createdBy: auth.uid || '',
          createdAt: FieldValue.serverTimestamp(),
        });
      }
    });

    return { success: true as const, message: 'Reembolso registrado.', refundId: finalRefundId };
  } catch (error: any) {
    if (error instanceof RefundError) {
      throw error;
    }
    throw new RefundError(`Error en la transacción: ${error.message}`, 500);
  }
}
