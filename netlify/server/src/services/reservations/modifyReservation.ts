import { getFirebaseAdmin } from '../../firebase/admin';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import type { AuthContext } from '../../auth/verifyAuth';
import { ReservationError } from './createReservation';

export interface ModifyReservationPayload {
  establishmentId: string;
  reservationId: string;
  updates: Record<string, any>;
}

export interface ModifyReservationResult {
  success: true;
  message: string;
}

export async function modifyReservationService(
  payload: ModifyReservationPayload,
  auth: AuthContext
): Promise<ModifyReservationResult> {
  getFirebaseAdmin();
  const db = getFirestore();

  const { establishmentId, reservationId, updates } = payload;

  if (!establishmentId || !reservationId || !updates || typeof updates !== 'object') {
    throw new ReservationError('Parámetros requeridos faltantes.', 400);
  }

  if (!auth.roles[establishmentId]) {
    throw new ReservationError('No tienes permisos.', 403);
  }

  const estRef = db.collection('establishments').doc(establishmentId);
  const reservationRef = estRef.collection('reservations').doc(reservationId);

  try {
    await db.runTransaction(async (transaction) => {
      const resSnap = await transaction.get(reservationRef);
      if (!resSnap.exists) {
        throw new ReservationError('La reserva no existe.', 404);
      }

      const reservation = resSnap.data();
      if (!reservation) throw new ReservationError('Datos de reserva inválidos.', 500);
      
      if (reservation.status !== 'confirmed') {
        throw new ReservationError('Solo se pueden modificar reservas confirmadas.', 409);
      }

      const allowedUpdates = ['primaryGuestId', 'guestIds', 'channel'];
      const filteredUpdates: any = {};

      for (const key of allowedUpdates) {
        if (key in updates) {
          filteredUpdates[key] = updates[key];
        }
      }

      filteredUpdates.updatedAt = FieldValue.serverTimestamp();

      transaction.update(reservationRef, filteredUpdates);
    });

    return { success: true as const, message: 'Reserva modificada.' };
  } catch (error: any) {
    if (error instanceof ReservationError) {
      throw error;
    }
    throw new ReservationError(`Error en la transacción: ${error.message}`, 500);
  }
}
