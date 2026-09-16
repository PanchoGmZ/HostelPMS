import { getFirebaseAdmin } from '../../firebase/admin';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import type { AuthContext } from '../../auth/verifyAuth';
import { ReservationError } from '../reservations/createReservation';

export interface CheckInGuestPayload {
  establishmentId: string;
  reservationId: string;
  guestIds: string[];
  deposit?: number;
}

export interface CheckInGuestResult {
  success: true;
  stayId: string;
}

export async function checkInGuestService(
  payload: CheckInGuestPayload,
  auth: AuthContext
): Promise<CheckInGuestResult> {
  getFirebaseAdmin();
  const db = getFirestore();

  const { establishmentId, reservationId, guestIds, deposit } = payload;

  if (!establishmentId || !reservationId || !Array.isArray(guestIds)) {
    throw new ReservationError('Faltan parámetros requeridos.', 400);
  }

  if (!auth.roles[establishmentId]) {
    throw new ReservationError('No pertenecés al staff de este establecimiento.', 403);
  }

  const estRef = db.collection('establishments').doc(establishmentId);
  const reservationRef = estRef.collection('reservations').doc(reservationId);
  const stayRef = estRef.collection('stays').doc();
  const folioRef = estRef.collection('folios').doc();

  try {
    await db.runTransaction(async (transaction) => {
      const resSnap = await transaction.get(reservationRef);
      if (!resSnap.exists) {
        throw new ReservationError('La reserva no existe.', 404);
      }

      const reservation = resSnap.data();
      if (!reservation) throw new ReservationError('Datos de reserva inválidos.', 500);
      
      if (reservation.status !== 'confirmed') {
        throw new ReservationError('La reserva no está en estado confirmado.', 409);
      }

      // Check duplicados: verificar si ya existe un stay activo para esta reserva.
      const staysSnap = await transaction.get(
        estRef.collection('stays').where('reservationId', '==', reservationId).limit(1)
      );
      if (!staysSnap.empty) {
        throw new ReservationError('Ya existe una estadía (Check-in realizado) para esta reserva.', 409);
      }

      // Actualizamos el status de la reserva a 'completed' indicando que ya se efectivizó
      transaction.update(reservationRef, {
        status: 'completed',
        updatedAt: FieldValue.serverTimestamp(),
      });

      transaction.set(stayRef, {
        reservationId: reservationId,
        guestIds: guestIds && guestIds.length > 0 ? guestIds : [reservation.primaryGuestId].filter(Boolean),
        roomId: reservation.roomId,
        bedIds: reservation.bedIds,
        checkInDate: reservation.checkInDate,
        expectedCheckOutDate: reservation.checkOutDate,
        actualCheckOutDate: null,
        status: 'active',
        deposit: deposit || 0,
        documentVerified: false,
        createdBy: auth.uid || '',
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });

      const reservationData = reservation;
      transaction.set(folioRef, {
        stayId: stayRef.id,
        currency: reservationData.currency || 'BOB',
        totalCharges: 0,
        totalPaid: deposit || 0,
        balance: -(deposit || 0),
        status: 'open',
        charges: [],
        payments: deposit ? [{ 
          id: db.collection('dummy').doc().id, 
          amount: deposit, 
          method: 'deposit', 
          status: 'completed', 
          createdAt: Timestamp.now() 
        }] : [],
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
    });

    return { success: true as const, stayId: stayRef.id };
  } catch (error: any) {
    if (error instanceof ReservationError) {
      throw error;
    }
    throw new ReservationError(`Error en la transacción: ${error.message}`, 500);
  }
}
