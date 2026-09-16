import { getFirebaseAdmin } from '../../firebase/admin';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import type { AuthContext } from '../../auth/verifyAuth';

import * as crypto from 'crypto';

export interface AddConsumptionPayload {
  establishmentId: string;
  stayId: string;
  items: { productId: string; quantity: number }[];
  /** Optional: if provided, registers payment atomically with the consumption */
  payNow?: {
    method: 'cash' | 'card' | 'transfer' | 'qr';
    reference?: string;
  };
}

export interface AddConsumptionResult {
  success: true;
  message: string;
  chargeIds: string[];
  paymentId?: string;
}

export class ConsumptionError extends Error {
  constructor(message: string, public readonly httpStatus: number = 400) {
    super(message);
    this.name = 'ConsumptionError';
  }
}

export async function addConsumptionService(
  payload: AddConsumptionPayload,
  auth: AuthContext
): Promise<AddConsumptionResult> {
  getFirebaseAdmin();
  const db = getFirestore();

  const { establishmentId, stayId, items, payNow } = payload;

  if (!establishmentId || !stayId || !items || !Array.isArray(items) || items.length === 0) {
    throw new ConsumptionError('Parámetros requeridos faltantes (establishmentId, stayId, items).');
  }
  
  items.forEach((item) => {
    if (!item.productId || typeof item.quantity !== 'number' || item.quantity <= 0) {
      throw new ConsumptionError('Cada item debe tener productId válido y cantidad mayor a 0.');
    }
  });

  if (!auth.roles[establishmentId]) {
    throw new ConsumptionError('No tienes permisos.', 403);
  }

  if (payNow) {
    const validMethods = ['cash', 'card', 'transfer', 'qr'];
    if (!validMethods.includes(payNow.method)) {
      throw new ConsumptionError('Método de pago inválido.');
    }
  }

  const estRef = db.collection('establishments').doc(establishmentId);
  const stayRef = estRef.collection('stays').doc(stayId);

  let chargeIdsResult: string[] = [];
  let paymentIdResult: string | undefined;

  try {
    await db.runTransaction(async (transaction) => {
      // ── PHASE 1: ALL READS ──────────────────────────────────────────

      const staySnap = await transaction.get(stayRef);
      if (!staySnap.exists) {
        throw new ConsumptionError('La estadía no existe.', 404);
      }

      const foliosSnap = await transaction.get(
        estRef.collection('folios').where('stayId', '==', stayId).limit(1)
      );
      if (foliosSnap.empty) {
        throw new ConsumptionError('No existe folio para esta estadía.', 500);
      }

      // Read all products at once
      const productSnaps = await Promise.all(
        items.map((item) => transaction.get(estRef.collection('products').doc(item.productId)))
      );

      // Validate that all exist
      productSnaps.forEach((snap, idx) => {
        if (!snap.exists) {
          throw new ConsumptionError(`El producto especificado (${items[idx].productId}) no existe.`, 404);
        }
      });

      // Read cash shift upfront if payNow (avoids read-after-write)
      let cashShiftsSnap: FirebaseFirestore.QuerySnapshot | null = null;
      if (payNow) {
        cashShiftsSnap = await transaction.get(
          estRef.collection('cashShifts').where('status', '==', 'open').limit(1)
        );
      }

      // ── PHASE 2: CALCULATIONS & WRITES ──────────────────────────────

      const folioRef = foliosSnap.docs[0].ref;
      const folioData = foliosSnap.docs[0].data();
      const now = Timestamp.now();

      let updatedCharges = folioData.charges || [];
      let newTotalCharges = folioData.totalCharges || 0;
      let totalAmount = 0;
      
      const chargeIds: string[] = [];

      items.forEach((item, idx) => {
        const productSnap = productSnaps[idx];
        const productData = productSnap.data()!;
        const description = productData.name as string;
        const unitPrice = productData.salePrice as number;
        const currentStock = (productData.currentStock as number) || 0;
        const minimumStock = (productData.minimumStock as number) || 0;

        if (currentStock < item.quantity) {
          throw new ConsumptionError(
            `Stock insuficiente para "${description}". Disponible: ${currentStock}, Solicitado: ${item.quantity}.`
          );
        }

        const amount = item.quantity * unitPrice;
        totalAmount += amount;
        
        const chargeId = crypto.randomUUID();
        chargeIds.push(chargeId);

        const newCharge = {
          id: chargeId,
          description,
          quantity: item.quantity,
          unitPrice,
          amount,
          status: 'pending',
          productId: item.productId,
          createdAt: now,
        };

        updatedCharges = [...updatedCharges, newCharge];
        newTotalCharges += amount;

        // Stock management
        const resultingStock = currentStock - item.quantity;
        const movementRef = estRef.collection('stockMovements').doc();

        transaction.set(movementRef, {
          productId: item.productId,
          type: 'consumption',
          quantity: item.quantity,
          resultingStock,
          relatedChargeId: chargeId,
          relatedPurchaseId: null,
          createdBy: auth.uid || '',
          createdAt: FieldValue.serverTimestamp(),
        });

        transaction.update(productSnap.ref, {
          currentStock: resultingStock,
          lowStock: resultingStock <= minimumStock,
          updatedAt: FieldValue.serverTimestamp(),
        });
      });

      chargeIdsResult = chargeIds;

      // Handle optional immediate payment
      let newTotalPaid = folioData.totalPaid || 0;
      let updatedPayments = folioData.payments || [];

      if (payNow) {
        const paymentId = crypto.randomUUID();
        paymentIdResult = paymentId;

        const newPayment = {
          id: paymentId,
          amount: totalAmount,
          method: payNow.method,
          status: 'completed',
          reference: payNow.reference || null,
          createdAt: now,
        };

        updatedPayments = [...updatedPayments, newPayment];
        newTotalPaid += totalAmount;

        // Register cash shift movement if there's an open shift
        if (cashShiftsSnap && !cashShiftsSnap.empty) {
          const cashShiftRef = cashShiftsSnap.docs[0].ref;
          const movementRef = cashShiftRef.collection('movements').doc();

          transaction.set(movementRef, {
            type: 'payment',
            amount: totalAmount,
            method: payNow.method,
            description: `Consumo POS - ${items.length} producto(s) - ${stayId}`,
            relatedFolioId: folioRef.id,
            relatedPaymentId: paymentIdResult,
            createdBy: auth.uid || '',
            createdAt: FieldValue.serverTimestamp(),
          });
        }
      }

      const newBalance = newTotalPaid - newTotalCharges;

      transaction.update(folioRef, {
        charges: updatedCharges,
        ...(payNow ? { payments: updatedPayments } : {}),
        totalCharges: newTotalCharges,
        ...(payNow ? { totalPaid: newTotalPaid } : {}),
        balance: newBalance,
        updatedAt: FieldValue.serverTimestamp(),
      });
    });

    const message = payNow
      ? 'Consumo registrado y pago procesado exitosamente.'
      : 'Consumo registrado exitosamente (cargado a la cuenta).';

    return { success: true as const, message, chargeIds: chargeIdsResult, paymentId: paymentIdResult };
  } catch (error: any) {
    if (error instanceof ConsumptionError) {
      throw error;
    }
    throw new ConsumptionError(`Error en la transacción: ${error.message}`, 500);
  }
}
