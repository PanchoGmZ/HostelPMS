import { getFirebaseAdmin } from '../../firebase/admin';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import type { AuthContext } from '../../auth/verifyAuth';
import * as crypto from 'crypto';

export interface RecordPaymentPayload {
  establishmentId: string;
  stayId: string;
  amount: number;
  method: string;
  reference?: string;
}

export interface RecordPaymentResult {
  success: true;
  message: string;
  paymentId: string;
}

export class PaymentError extends Error {
  constructor(message: string, public readonly httpStatus: number = 400) {
    super(message);
    this.name = 'PaymentError';
  }
}

export async function recordPaymentService(
  payload: RecordPaymentPayload,
  auth: AuthContext
): Promise<RecordPaymentResult> {
  getFirebaseAdmin();
  const db = getFirestore();

  const { establishmentId, stayId, amount, method, reference } = payload;

  if (!establishmentId || !stayId || typeof amount !== 'number' || !method) {
    throw new PaymentError('Parámetros inválidos.');
  }

  if (amount <= 0) {
    throw new PaymentError('El monto debe ser mayor a 0.');
  }

  if (!auth.roles[establishmentId]) {
    throw new PaymentError('No tienes permisos.', 403);
  }

  const estRef = db.collection('establishments').doc(establishmentId);
  const stayRef = estRef.collection('stays').doc(stayId);

  let finalPaymentId = '';

  try {
    await db.runTransaction(async (transaction) => {
      // ── PHASE 1: ALL READS ──────────────────────────────────────────

      const staySnap = await transaction.get(stayRef);
      if (!staySnap.exists) {
        throw new PaymentError('La estadía no existe.', 404);
      }

      const foliosSnap = await transaction.get(
        estRef.collection('folios').where('stayId', '==', stayId).limit(1)
      );
      if (foliosSnap.empty) {
        throw new PaymentError('No existe folio para esta estadía.', 500);
      }

      // Leer la caja (cashShift) abierta preventivamente para evitar "Read-After-Write"
      const cashShiftsSnap = await transaction.get(
        estRef.collection('cashShifts').where('status', '==', 'open').limit(1)
      );

      // ── PHASE 2: CALCULATIONS & WRITES ──────────────────────────────

      const folioRef = foliosSnap.docs[0].ref;
      const folioData = foliosSnap.docs[0].data();

      const paymentId = crypto.randomUUID();
      finalPaymentId = paymentId;

      const updatedPayments = [
        ...(folioData.payments || []),
        {
          id: paymentId,
          amount,
          method,
          status: 'completed',
          reference: reference || null,
          createdAt: Timestamp.now(),
        },
      ];

      // Cálculo server-side
      const newTotalPaid = (folioData.totalPaid || 0) + amount;
      const newBalance = newTotalPaid - (folioData.totalCharges || 0);

      transaction.update(folioRef, {
        payments: updatedPayments,
        totalPaid: newTotalPaid,
        balance: newBalance,
        updatedAt: FieldValue.serverTimestamp(),
      });

      // Registrar movimiento de caja si hay una caja abierta (fiel a la lógica original)
      if (!cashShiftsSnap.empty) {
        const cashShiftRef = cashShiftsSnap.docs[0].ref;
        const movementRef = cashShiftRef.collection('movements').doc();
        
        transaction.set(movementRef, {
          type: 'payment',
          amount,
          method,
          description: `Pago de folio - ${stayId}`,
          relatedFolioId: folioRef.id,
          relatedPaymentId: paymentId, // Asentamos explícitamente el paymentId para auditoría
          createdBy: auth.uid || '',
          createdAt: FieldValue.serverTimestamp(),
        });
      }
    });

    return { success: true as const, message: 'Pago registrado.', paymentId: finalPaymentId };
  } catch (error: any) {
    if (error instanceof PaymentError) {
      throw error;
    }
    throw new PaymentError(`Error en la transacción: ${error.message}`, 500);
  }
}
