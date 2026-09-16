import { getFirebaseAdmin } from '../../firebase/admin';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import type { AuthContext } from '../../auth/verifyAuth';

export interface CloseCashShiftPayload {
  establishmentId: string;
  cashShiftId: string;
  closingAmount: number;
  notes?: string | null;
}

export interface CloseCashShiftResult {
  success: true;
  message: string;
  shiftId: string;
  discrepancy: number;
}

export class CloseShiftError extends Error {
  constructor(message: string, public readonly httpStatus: number = 400) {
    super(message);
    this.name = 'CloseShiftError';
  }
}

export async function closeCashShiftService(
  payload: CloseCashShiftPayload,
  auth: AuthContext
): Promise<CloseCashShiftResult> {
  getFirebaseAdmin();
  const db = getFirestore();

  const { establishmentId, cashShiftId, closingAmount, notes } = payload;

  if (!establishmentId || !cashShiftId || typeof closingAmount !== 'number') {
    throw new CloseShiftError('Parámetros inválidos.');
  }

  if (closingAmount < 0 || !Number.isFinite(closingAmount)) {
    throw new CloseShiftError('El monto de cierre debe ser un número mayor o igual a 0.');
  }

  if (!auth.roles[establishmentId]) {
    throw new CloseShiftError('No tienes permisos.', 403);
  }

  const estRef = db.collection('establishments').doc(establishmentId);
  const shiftRef = estRef.collection('cashShifts').doc(cashShiftId);

  let discrepancyResult = 0;

  try {
    await db.runTransaction(async (transaction) => {
      // ── PHASE 1: Lecturas ─────────────────────────────
      const shiftSnap = await transaction.get(shiftRef);
      if (!shiftSnap.exists) {
        throw new CloseShiftError('La caja no existe.', 404);
      }

      const shift = shiftSnap.data();
      if (!shift) throw new CloseShiftError('Datos de caja inválidos.', 500);
      
      if (shift.status !== 'open') {
        throw new CloseShiftError('La caja no está abierta.', 409);
      }

      // Leer todos los movimientos de la caja para calcular el balance real.
      // (La Callable original tenía un bug: ignoraba los movimientos y fijaba totalExpected = openingAmount)
      const movementsSnap = await transaction.get(shiftRef.collection('movements'));
      
      // ── PHASE 2: Cálculos ─────────────────────────────
      let cashIn = 0;
      let cashOut = 0;

      for (const doc of movementsSnap.docs) {
        const m = doc.data();
        const method = m.method || 'cash';
        
        // Coherencia Frontend: solo contamos el dinero físico para el cuadre de caja
        if (method === 'cash') {
          if (m.type === 'in' || m.type === 'pago_folio' || m.type === 'payment' || m.type === 'income') {
            cashIn += (m.amount || 0);
          } else if (m.type === 'out' || m.type === 'expense') {
            cashOut += (m.amount || 0);
          }
        }
      }

      const totalExpected = (shift.openingAmount || 0) + cashIn - cashOut;
      const discrepancy = closingAmount - totalExpected;
      discrepancyResult = discrepancy;

      // ── PHASE 3: Escrituras ─────────────────────────────
      transaction.update(shiftRef, {
        status: 'closed',
        closingAmount,
        notes: notes || null,
        closedBy: auth.uid || '',
        closedAt: FieldValue.serverTimestamp(),
        totalExpected: totalExpected,
        totalActual: closingAmount,
        discrepancy: discrepancy,
        updatedAt: FieldValue.serverTimestamp(),
      });
    });

    return { 
      success: true as const, 
      message: 'Caja cerrada exitosamente.', 
      shiftId: cashShiftId,
      discrepancy: discrepancyResult
    };
  } catch (error: any) {
    if (error instanceof CloseShiftError) {
      throw error;
    }
    throw new CloseShiftError(`Error en la transacción: ${error.message}`, 500);
  }
}
