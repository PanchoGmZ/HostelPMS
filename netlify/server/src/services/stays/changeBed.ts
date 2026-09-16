import { getFirebaseAdmin } from '../../firebase/admin';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import type { AuthContext } from '../../auth/verifyAuth';
import { ReservationError } from '../reservations/createReservation';

export interface ChangeBedPayload {
  establishmentId: string;
  reservationId: string;
  lineId: string;
  newBedId: string;
}

export interface ChangeBedResult {
  success: true;
  message: string;
}

// Helper explícito para parsear YYYY-MM-DD a medianoche de America/La_Paz (UTC-4)
const parseDateLocal = (value: unknown): Date | null => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000-04:00`);
  return Number.isNaN(date.getTime()) ? null : date;
};

export async function changeBedService(
  payload: ChangeBedPayload,
  auth: AuthContext
): Promise<ChangeBedResult> {
  getFirebaseAdmin();
  const db = getFirestore();

  const { establishmentId, reservationId, lineId, newBedId } = payload;

  if (!establishmentId || !reservationId || !lineId || !newBedId) {
    throw new ReservationError('Parámetros requeridos faltantes.', 400);
  }

  if (!auth.roles[establishmentId]) {
    throw new ReservationError('No tienes permisos.', 403);
  }

  const estRef = db.collection('establishments').doc(establishmentId);
  const lineRef = estRef.collection('reservations').doc(reservationId).collection('lines').doc(lineId);

  try {
    await db.runTransaction(async (transaction) => {
      // ── PHASE 1: ALL READS ──────────────────────────────────────────

      const lineSnap = await transaction.get(lineRef);
      if (!lineSnap.exists) {
        throw new ReservationError('La línea de reserva no existe.', 404);
      }

      const line = lineSnap.data();
      if (!line) throw new ReservationError('Datos de línea inválidos.', 500);
      const oldBedId = line.bedId;

      if (oldBedId === newBedId) {
        throw new ReservationError('La cama nueva es la misma que la actual.', 400);
      }

      // Calcular fechas iniciales a partir del mapa de precios de la línea
      const baseBedDates = Object.keys(line.pricePerNight || {}).sort();
      if (baseBedDates.length === 0) {
        throw new ReservationError('La línea de reserva no tiene fechas asignadas.', 500);
      }
      let bedDates = [...baseBedDates];

      // Verificar si hay una estadía activa asociada para incluir posibles noches extendidas
      const staysSnap = await transaction.get(
        estRef.collection('stays').where('reservationId', '==', reservationId).where('status', '==', 'active').limit(1)
      );
      let activeStayRef: FirebaseFirestore.DocumentReference | null = null;
      let activeStayData: any = null;

      if (!staysSnap.empty) {
        const doc = staysSnap.docs[0];
        const data = doc.data();
        if (data && data.bedIds && data.bedIds.includes(oldBedId)) {
          activeStayRef = doc.ref;
          activeStayData = data;
          
          // Ampliar rango hasta el expectedCheckOutDate real
          const startDateStr = baseBedDates[0];
          const expectedCheckOutSecs = data.expectedCheckOutDate.seconds;
          const expectedCheckOutDate = new Date(expectedCheckOutSecs * 1000);
          
          // Extraemos la fecha garantizando YYYY-MM-DD
          const endDateStr = expectedCheckOutDate.toISOString().slice(0, 10);
          
          const startDateLocal = parseDateLocal(startDateStr);
          const endDateLocal = parseDateLocal(endDateStr);
          
          if (startDateLocal && endDateLocal && startDateLocal < endDateLocal) {
            bedDates = [];
            for (let d = new Date(startDateLocal); d < endDateLocal; d.setUTCDate(d.getUTCDate() + 1)) {
              bedDates.push(d.toISOString().slice(0, 10));
            }
          }
        }
      }

      // Recopilar todos los docIds de availability que necesitamos (old + new)
      const oldAvailTargets: { [docId: string]: string[] } = {};
      const newAvailTargets: { [docId: string]: string[] } = {};

      for (const dateStr of bedDates) {
        const [year, month] = dateStr.split('-');
        const yearMonth = `${year}-${month}`;
        const day = dateStr.split('-')[2];

        const oldDocId = `${oldBedId}_${yearMonth}`;
        if (!oldAvailTargets[oldDocId]) oldAvailTargets[oldDocId] = [];
        oldAvailTargets[oldDocId].push(day);

        const newDocId = `${newBedId}_${yearMonth}`;
        if (!newAvailTargets[newDocId]) newAvailTargets[newDocId] = [];
        newAvailTargets[newDocId].push(day);
      }

      // Lectura batch de todos los documentos de availability (nuevos primero para validar)
      const newDocIds = Object.keys(newAvailTargets);
      const newDocRefs = newDocIds.map((id) => estRef.collection('availability').doc(id));
      const newSnapshots = newDocRefs.length > 0
        ? await Promise.all(newDocRefs.map((ref) => transaction.get(ref)))
        : [];

      const oldDocIds = Object.keys(oldAvailTargets);
      const oldDocRefs = oldDocIds.map((id) => estRef.collection('availability').doc(id));
      // Filtrar los que ya leímos (si old y new comparten docId, no releer)
      const alreadyRead = new Set(newDocIds);
      const oldOnlyDocIds: string[] = [];
      const oldOnlyDocRefs: FirebaseFirestore.DocumentReference[] = [];
      oldDocIds.forEach((id, i) => {
        if (!alreadyRead.has(id)) {
          oldOnlyDocIds.push(id);
          oldOnlyDocRefs.push(oldDocRefs[i]);
        }
      });
      const oldOnlySnapshots = oldOnlyDocRefs.length > 0
        ? await Promise.all(oldOnlyDocRefs.map((ref) => transaction.get(ref)))
        : [];

      // Construir mapa de snapshots para acceso rápido
      const snapMap = new Map<string, FirebaseFirestore.DocumentSnapshot>();
      newDocIds.forEach((id, i) => snapMap.set(id, newSnapshots[i]));
      oldOnlyDocIds.forEach((id, i) => snapMap.set(id, oldOnlySnapshots[i]));

      // ── PHASE 2: VALIDATE new bed availability ──────────────────────
      for (const docId of newDocIds) {
        const snap = snapMap.get(docId)!;
        if (!snap.exists) continue;
        const days = snap.data()?.days || {};
        for (const day of newAvailTargets[docId]) {
          if (days[day] && days[day].reservationId !== reservationId) {
            const yearMonth = docId.replace(`${newBedId}_`, '');
            throw new ReservationError(
              `La cama ${newBedId} no está disponible el ${yearMonth}-${day}.`,
              409
            );
          }
        }
      }

      // ── PHASE 3: ALL WRITES ─────────────────────────────────────────

      // 3a. Update reservation line
      transaction.update(lineRef, {
        bedId: newBedId,
        updatedAt: FieldValue.serverTimestamp(),
      });

      // 3b. Release old bed availability
      for (const docId of oldDocIds) {
        const snap = snapMap.get(docId)!;
        if (!snap.exists) continue;

        const data = snap.data();
        if (!data?.days) continue;

        const days = { ...data.days };
        let changed = false;
        for (const day of oldAvailTargets[docId]) {
          if (days[day] && days[day].reservationId === reservationId) {
            delete days[day];
            changed = true;
          }
        }
        if (changed) {
          transaction.update(estRef.collection('availability').doc(docId), { days });
        }
      }

      // 3c. Assign new bed availability
      for (let i = 0; i < newDocIds.length; i++) {
        const docId = newDocIds[i];
        const snap = snapMap.get(docId)!;
        const existingDays = snap.exists ? { ...(snap.data()?.days || {}) } : {};

        for (const day of newAvailTargets[docId]) {
          existingDays[day] = {
            reservationId,
            reservationLineId: lineId,
            mode: line.saleMode,
          };
        }

        transaction.set(
          newDocRefs[i],
          {
            bedId: newBedId,
            roomId: line.roomId,
            days: existingDays,
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
      }

      // 3d. Update active stay if applicable
      if (activeStayRef && activeStayData) {
        const newBedIds = activeStayData.bedIds.map((id: string) => (id === oldBedId ? newBedId : id));
        transaction.update(activeStayRef, {
          bedIds: newBedIds,
          updatedAt: FieldValue.serverTimestamp(),
        });
      }
    });

    return { success: true as const, message: 'Cama cambiada.' };
  } catch (error: any) {
    if (error instanceof ReservationError) {
      throw error;
    }
    throw new ReservationError(`Error en la transacción: ${error.message}`, 500);
  }
}
