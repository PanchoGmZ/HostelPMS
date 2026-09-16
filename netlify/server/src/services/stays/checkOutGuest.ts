import { getFirebaseAdmin } from '../../firebase/admin';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import type { AuthContext } from '../../auth/verifyAuth';
import { ReservationError } from '../reservations/createReservation';

export interface CheckOutGuestPayload {
  establishmentId: string;
  stayId: string;
  actualCheckOut?: string;
  notes?: string;
}

export interface CheckOutGuestResult {
  success: true;
  message: string;
}

export async function checkOutGuestService(
  payload: CheckOutGuestPayload,
  auth: AuthContext
): Promise<CheckOutGuestResult> {
  getFirebaseAdmin();
  const db = getFirestore();

  const { establishmentId, stayId, actualCheckOut } = payload;

  if (!establishmentId || !stayId) {
    throw new ReservationError('Parámetros requeridos faltantes.', 400);
  }

  if (!auth.roles[establishmentId]) {
    throw new ReservationError('No tienes permisos.', 403);
  }

  const estRef = db.collection('establishments').doc(establishmentId);
  const stayRef = estRef.collection('stays').doc(stayId);

  // Parse actualCheckOut if provided, otherwise use current date
  let checkOutDate: Date;
  if (actualCheckOut) {
    checkOutDate = new Date(`${actualCheckOut}T12:00:00.000-04:00`); 
    if (Number.isNaN(checkOutDate.getTime())) {
      throw new ReservationError('Fecha de checkout inválida.', 400);
    }
  } else {
    checkOutDate = new Date();
  }

  // Helper para obtener YYYY-MM-DD en UTC-4
  const getLocalYMD = (d: Date) => {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/La_Paz',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
    return formatter.format(d);
  };

  const parseDateLocal = (value: unknown): Date | null => {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
    const date = new Date(`${value}T00:00:00.000-04:00`);
    return Number.isNaN(date.getTime()) ? null : date;
  };

  try {
    await db.runTransaction(async (transaction) => {
      // ── PHASE 1: ALL READS ──────────────────────────────────────────

      const staySnap = await transaction.get(stayRef);
      if (!staySnap.exists) {
        throw new ReservationError('La estadía no existe.', 404);
      }

      const stay = staySnap.data();
      if (!stay) throw new ReservationError('Datos de estadía inválidos.', 500);
      
      if (stay.status !== 'active') {
        throw new ReservationError('La estadía ya fue cerrada.', 409);
      }

      const foliosSnap = await transaction.get(estRef.collection('folios').where('stayId', '==', stayId).limit(1));
      if (foliosSnap.empty) {
        throw new ReservationError('No existe folio para esta estadía.', 500);
      }

      const folioData = foliosSnap.docs[0].data();
      if (folioData.balance < 0) {
        throw new ReservationError(`El folio tiene deuda pendiente: ${Math.abs(folioData.balance)}. Debe completarse el pago antes del check-out.`, 400);
      }

      const bedIds: string[] = stay.bedIds || [];
      const actualCheckOutStr = getLocalYMD(checkOutDate);
      const expectedCheckOutSecs = stay.expectedCheckOutDate.seconds;
      const expectedCheckOutDate = new Date(expectedCheckOutSecs * 1000);
      const expectedCheckOutStr = getLocalYMD(expectedCheckOutDate);

      const actualLocal = parseDateLocal(actualCheckOutStr);
      const expectedLocal = parseDateLocal(expectedCheckOutStr);

      const daysToFree: string[] = [];
      if (actualLocal && expectedLocal && actualLocal < expectedLocal) {
        for (let d = new Date(actualLocal); d < expectedLocal; d.setUTCDate(d.getUTCDate() + 1)) {
          daysToFree.push(d.toISOString().slice(0, 10)); // d is at 00:00 UTC-4, so toISOString gives correct YYYY-MM-DD? Wait no!
          // Actually, if d is 00:00 UTC-4, it is 04:00 UTC. So toISOString() WILL give the correct YYYY-MM-DD.
        }
      } else {
        // Si actualCheckOut >= expectedCheckOutDate o no hay fechas válidas, NO liberamos nada
        // pues el rango de la reserva ya pasó y se asume que las noches ya pernoctadas quedan inamovibles.
      }
      
      // Corregimos la forma de llenar daysToFree para estar seguros:
      daysToFree.length = 0; // reset
      if (actualLocal && expectedLocal && actualLocal < expectedLocal) {
        for (let d = new Date(actualLocal); d < expectedLocal; d.setUTCDate(d.getUTCDate() + 1)) {
          daysToFree.push(getLocalYMD(d));
        }
      }

      // Recopilamos todos los documentos de availability afectados
      const availTargets: { [docId: string]: string[] } = {};
      for (const bedId of bedIds) {
        for (const dateStr of daysToFree) {
          const [year, month, day] = dateStr.split('-');
          const docId = `${bedId}_${year}-${month}`;
          if (!availTargets[docId]) availTargets[docId] = [];
          availTargets[docId].push(day);
        }
      }

      const docIds = Object.keys(availTargets);
      const availRefs = docIds.map((id) => estRef.collection('availability').doc(id));
      const availSnaps = availRefs.length > 0
        ? await Promise.all(availRefs.map(ref => transaction.get(ref)))
        : [];

      // ── PHASE 2: ALL WRITES ─────────────────────────────────────────

      transaction.update(stayRef, {
        actualCheckOutDate: Timestamp.fromDate(checkOutDate),
        status: 'checked_out',
        updatedAt: FieldValue.serverTimestamp(),
      });

      transaction.update(foliosSnap.docs[0].ref, {
        status: 'closed',
        updatedAt: FieldValue.serverTimestamp(),
      });

      // Liberar availability de forma segura y estricta
      for (let i = 0; i < docIds.length; i++) {
        const docId = docIds[i];
        const snap = availSnaps[i];
        const targetDays = availTargets[docId];

        if (snap.exists) {
          const days = { ...(snap.data()?.days || {}) };
          let changed = false;

          for (const day of targetDays) {
            // SOLO borrar si el lock efectivamente le pertenece a esta reserva.
            if (days[day] && days[day].reservationId === stay.reservationId) {
              delete days[day];
              changed = true;
            }
          }

          if (changed) {
            transaction.update(availRefs[i], { days });
          }
        }
      }
    });

    return { success: true as const, message: 'Check-out completado.' };
  } catch (error: any) {
    if (error instanceof ReservationError) {
      throw error;
    }
    throw new ReservationError(`Error en la transacción: ${error.message}`, 500);
  }
}
