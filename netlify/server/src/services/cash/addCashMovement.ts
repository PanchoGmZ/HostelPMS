import { getFirebaseAdmin } from '../../firebase/admin';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import type { AuthContext } from '../../auth/verifyAuth';

export interface AddCashMovementPayload {
  establishmentId: string;
  cashShiftId?: string;
  shiftId?: string; // Fallback
  type: string;
  amount: number;
  reason?: string;
  description?: string;
  notes?: string | null;
  method?: string;
  currencyCode?: string;
  receivedAmount?: number;
}

export interface AddCashMovementResult {
  success: true;
  message: string;
  movementId: string;
}

export class CashMovementError extends Error {
  constructor(message: string, public readonly httpStatus: number = 400) {
    super(message);
    this.name = 'CashMovementError';
  }
}

export async function addCashMovementService(
  payload: AddCashMovementPayload,
  auth: AuthContext
): Promise<AddCashMovementResult> {
  getFirebaseAdmin();
  const db = getFirestore();

  const { establishmentId, type, amount, reason, description, notes, method = 'cash', currencyCode, receivedAmount } = payload;
  const cashShiftId = payload.cashShiftId || payload.shiftId;

  if (!establishmentId || !cashShiftId) {
    throw new CashMovementError('Faltan parámetros requeridos: establishmentId y cashShiftId son obligatorios.');
  }

  const validTypes = ['in', 'out', 'income', 'expense'];
  if (!type || !validTypes.includes(type)) {
    throw new CashMovementError(`El tipo de movimiento debe ser uno de: ${validTypes.join(', ')}.`);
  }

  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) {
    throw new CashMovementError('El monto (amount) debe ser un número positivo mayor a 0.');
  }

  const movementDescription = (reason || description || '').trim();
  if (!movementDescription) {
    throw new CashMovementError('El motivo o descripción del movimiento es obligatorio.');
  }

  if (!auth.roles[establishmentId]) {
    throw new CashMovementError('No perteneces al staff de este establecimiento.', 403);
  }

  const estRef = db.collection('establishments').doc(establishmentId);
  const shiftRef = estRef.collection('cashShifts').doc(cashShiftId);
  const movementRef = shiftRef.collection('movements').doc();

  try {
    await db.runTransaction(async (transaction) => {
      // ── PHASE 1: Lecturas preventivas ─────────────────────────────
      const shiftSnap = await transaction.get(shiftRef);
      if (!shiftSnap.exists) {
        throw new CashMovementError('El turno de caja especificado no existe.', 404);
      }

      const shift = shiftSnap.data();
      if (!shift) throw new CashMovementError('Datos de caja inválidos.', 500);
      if (shift.status !== 'open') {
        throw new CashMovementError('No se pueden registrar movimientos en una caja que no esté abierta.', 409);
      }

      // ── PHASE 2: Escrituras ─────────────────────────────────────────
      // OJO: La Callable original no actualiza totales de la caja (totalActual/totalExpected)
      // aquí, porque la vista Frontend calcula el total dinámicamente sumando la colección.
      transaction.set(movementRef, {
        type,
        amount,
        method: method || 'cash',
        currencyCode: currencyCode || 'BOB',
        receivedAmount: receivedAmount ?? amount,
        description: movementDescription,
        reason: movementDescription,
        notes: notes || null,
        relatedFolioId: null,
        createdBy: auth.uid || '',
        createdAt: FieldValue.serverTimestamp(),
      });
    });

    return { success: true as const, message: 'Movimiento de caja registrado exitosamente.', movementId: movementRef.id };
  } catch (error: any) {
    if (error instanceof CashMovementError) {
      throw error;
    }
    throw new CashMovementError(`Error en la transacción: ${error.message}`, 500);
  }
}
