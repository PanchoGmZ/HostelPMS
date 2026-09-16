import { getFirebaseAdmin } from '../../firebase/admin';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import type { AuthContext } from '../../auth/verifyAuth';
import { ReservationError } from './createReservation';

// ============================================================================
// Payload y respuesta
// ============================================================================
export interface CancelReservationPayload {
  establishmentId: string;
  reservationId: string;
  reason?: string;
}

export interface CancelReservationResult {
  success: true;
  message: string;
}

// ============================================================================
// Service: cancelReservation
// ============================================================================
export async function cancelReservationService(
  payload: CancelReservationPayload,
  auth: AuthContext
): Promise<CancelReservationResult> {
  getFirebaseAdmin();
  const db = getFirestore();

  const { establishmentId, reservationId, reason } = payload;

  if (!establishmentId || !reservationId) {
    throw new ReservationError('Parámetros requeridos faltantes.', 400);
  }

  // --- Autorización: el caller debe pertenecer al staff del establecimiento ---
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
      if (reservation.status === 'cancelled') {
        throw new ReservationError('La reserva ya estaba cancelada.', 409);
      }

      const bedIds: string[] = reservation.bedIds || [];
      // Leer los timestamps (dependiendo de la version del sdk, pueden ser Timestamp objetos o dicts)
      const checkInSecs = reservation.checkInDate?.seconds ?? reservation.checkInDate?._seconds;
      const checkOutSecs = reservation.checkOutDate?.seconds ?? reservation.checkOutDate?._seconds;

      if (!checkInSecs || !checkOutSecs) {
        throw new ReservationError('Fechas de reserva inválidas.', 500);
      }

      const checkInDate = new Date(checkInSecs * 1000);
      const checkOutDate = new Date(checkOutSecs * 1000);

      // 1. Recopilar todos los document IDs de availability que necesitamos leer
      const availabilityTargets: { [docId: string]: { bedId: string; days: string[] } } = {};

      for (
        let d = new Date(checkInDate);
        d < checkOutDate;
        d.setUTCDate(d.getUTCDate() + 1)
      ) {
        const dateStr = d.toISOString().split('T')[0];
        const [year, month, day] = dateStr.split('-');
        const yearMonth = `${year}-${month}`;

        for (const bedId of bedIds) {
          const docId = `${bedId}_${yearMonth}`;
          if (!availabilityTargets[docId]) {
            availabilityTargets[docId] = { bedId, days: [] };
          }
          availabilityTargets[docId].days.push(day);
        }
      }

      const docIds = Object.keys(availabilityTargets);
      const docRefs = docIds.map((docId) => estRef.collection('availability').doc(docId));
      
      // 2. Ejecutar TODAS las lecturas antes de cualquier escritura
      const snapshots = docRefs.length > 0 ? await Promise.all(docRefs.map(ref => transaction.get(ref))) : [];

      // 3. Procesar y ejecutar las escrituras
      snapshots.forEach((snap, i) => {
        if (!snap.exists) return;

        const docId = docIds[i];
        const target = availabilityTargets[docId];
        const data = snap.data();
        
        if (data && data.days) {
          const days = { ...data.days };
          let changed = false;

          for (const day of target.days) {
            // Liberar SI Y SOLO SI pertenece a la reserva que estamos cancelando
            if (days[day] && days[day].reservationId === reservationId) {
              delete days[day];
              changed = true;
            }
          }

          if (changed) {
            transaction.update(docRefs[i], { days });
          }
        }
      });

      // Actualizar reserva a cancelled
      transaction.update(reservationRef, {
        status: 'cancelled',
        cancellationReason: reason || null,
        cancelledAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
    });

    return { success: true as const, message: 'Reserva cancelada.' };
  } catch (error: any) {
    if (error instanceof ReservationError) {
      throw error;
    }
    throw new ReservationError(`Error en la transacción: ${error.message}`, 500);
  }
}
