import { getFirebaseAdmin } from '../../firebase/admin';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import type { AuthContext } from '../../auth/verifyAuth';

export interface OpenCashShiftPayload {
  establishmentId: string;
  openingAmount: number;
  notes?: string | null;
}

export interface OpenCashShiftResult {
  success: true;
  message: string;
}

export class CashShiftError extends Error {
  constructor(message: string, public readonly httpStatus: number = 400) {
    super(message);
    this.name = 'CashShiftError';
  }
}

export async function openCashShiftService(
  payload: OpenCashShiftPayload,
  auth: AuthContext
): Promise<OpenCashShiftResult> {
  getFirebaseAdmin();
  const db = getFirestore();

  const { establishmentId, openingAmount, notes } = payload;

  if (!establishmentId || typeof openingAmount !== 'number') {
    throw new CashShiftError('Parámetros inválidos.');
  }

  if (openingAmount < 0) {
    throw new CashShiftError('El monto de apertura no puede ser negativo.');
  }

  if (!auth.roles[establishmentId]) {
    throw new CashShiftError('No tienes permisos.', 403);
  }

  const estRef = db.collection('establishments').doc(establishmentId);

  try {
    await db.runTransaction(async (transaction) => {
      // PHASE 1: Lecturas preventivas
      // Usar limit(1) optimiza el lock para evitar lecturas fantasma
      const openShiftsSnap = await transaction.get(
        estRef.collection('cashShifts').where('status', '==', 'open').limit(1)
      );

      if (!openShiftsSnap.empty) {
        throw new CashShiftError('Ya existe una caja abierta.', 409);
      }

      // PHASE 2: Escrituras
      const shiftRef = estRef.collection('cashShifts').doc();
      
      transaction.set(shiftRef, {
        establishmentId,
        status: 'open',
        openingAmount,
        notes: notes || null,
        closingAmount: null,
        openedBy: auth.uid || '',
        closedBy: null,
        openedAt: FieldValue.serverTimestamp(),
        closedAt: null,
        movements: [], // No se usa en Firestore moderno (está como subcolección), pero preservamos la estructura original
        totalExpected: null,
        totalActual: null,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
    });

    return { success: true as const, message: 'Caja abierta exitosamente.' };
  } catch (error: any) {
    if (error instanceof CashShiftError) {
      throw error;
    }
    throw new CashShiftError(`Error en la transacción: ${error.message}`, 500);
  }
}
