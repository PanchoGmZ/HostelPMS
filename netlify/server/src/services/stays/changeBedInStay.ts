import { getFirebaseAdmin } from '../../firebase/admin';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import type { AuthContext } from '../../auth/verifyAuth';
import { ReservationError } from '../reservations/createReservation';
import { processDailySummaryForEstablishment } from '../reports/generateDailySummary';
import * as crypto from 'crypto';

export interface ChangeBedInStayPayload {
  establishmentId: string;
  stayId: string;
  toRoomId: string;
  toBedIds: string[];
  effectiveDate: string;  // YYYY-MM-DD (default = hoy en Bolivia)
  reason?: string;
}

export interface ChangeBedInStayResult {
  success: true;
  message: string;
}

// Helper: parsear YYYY-MM-DD a medianoche Bolivia (UTC-4)
const parseDateLocal = (value: unknown): Date | null => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const d = new Date(`${value}T00:00:00.000-04:00`);
  return Number.isNaN(d.getTime()) ? null : d;
};

const getLocalYMD = (d: Date): string =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/La_Paz',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(d);

export async function changeBedInStayService(
  payload: ChangeBedInStayPayload,
  auth: AuthContext
): Promise<ChangeBedInStayResult> {
  getFirebaseAdmin();
  const db = getFirestore();

  const { establishmentId, stayId, toRoomId, toBedIds, effectiveDate, reason } = payload;

  if (!establishmentId || !stayId || !toRoomId || !toBedIds || toBedIds.length === 0 || !effectiveDate) {
    throw new ReservationError('Parámetros requeridos faltantes.', 400);
  }

  if (!auth.roles[establishmentId]) {
    throw new ReservationError('No tienes permisos.', 403);
  }

  const effectiveLocal = parseDateLocal(effectiveDate);
  if (!effectiveLocal) {
    throw new ReservationError('Fecha efectiva inválida. Use YYYY-MM-DD.', 400);
  }

  const estRef = db.collection('establishments').doc(establishmentId);
  const stayRef = estRef.collection('stays').doc(stayId);

  // Datos para regeneración retroactiva de summaries post-transacción
  const retroContext: { affectedDates: string[] } = { affectedDates: [] };

  try {
    await db.runTransaction(async (transaction) => {
      // ── PHASE 1: ALL READS ──────────────────────────────────────────

      const staySnap = await transaction.get(stayRef);
      if (!staySnap.exists) throw new ReservationError('La estadía no existe.', 404);

      const stay = staySnap.data();
      if (!stay) throw new ReservationError('Datos de estadía inválidos.', 500);
      if (stay.status !== 'active') throw new ReservationError('Solo se pueden cambiar habitaciones en estadías activas.', 409);

      const checkInDate = stay.checkInDate;
      const checkInLocal = new Date(checkInDate.seconds * 1000);
      const checkInStr = getLocalYMD(checkInLocal);

      const expectedCheckOutDate = stay.expectedCheckOutDate;
      const checkOutLocal = new Date(expectedCheckOutDate.seconds * 1000);
      const checkOutStr = getLocalYMD(checkOutLocal);

      // ── VALIDATE effectiveDate range ────────────────────────────────
      if (effectiveDate < checkInStr) {
        throw new ReservationError(`La fecha efectiva (${effectiveDate}) no puede ser anterior al check-in (${checkInStr}).`, 400);
      }
      if (effectiveDate >= checkOutStr) {
        throw new ReservationError(`La fecha efectiva (${effectiveDate}) debe ser anterior a la salida prevista (${checkOutStr}).`, 400);
      }

      const fromBedIds: string[] = stay.bedIds || [];
      const fromRoomId: string = stay.roomId;

      // Detectar saleMode
      const saleMode: string = stay.saleMode || (fromBedIds.length > 1 ? 'full_room' : 'bed');

      // Validar: no cambiar entre modes (bed → full_room o viceversa) si implica incompatibilidad
      const srcIsFullRoom = saleMode === 'full_room';
      const dstIsFullRoom = toBedIds.length > 1;
      if (srcIsFullRoom !== dstIsFullRoom) {
        throw new ReservationError('No se puede cambiar entre cama individual y habitación privada. Requiere una nueva operación.', 400);
      }

      // Misma ubicación = error
      if (fromRoomId === toRoomId && JSON.stringify([...fromBedIds].sort()) === JSON.stringify([...toBedIds].sort())) {
        throw new ReservationError('La nueva ubicación es la misma que la actual.', 400);
      }

      // Calcular días afectados: [effectiveDate, expectedCheckOut)
      const affectedDays: string[] = [];
      {
        const cursor = new Date(effectiveLocal);
        const endLocal = parseDateLocal(checkOutStr)!;
        while (cursor < endLocal) {
          affectedDays.push(getLocalYMD(cursor));
          cursor.setUTCDate(cursor.getUTCDate() + 1);
        }
      }

      retroContext.affectedDates = affectedDays.filter(d => d < getLocalYMD(new Date()));

      if (affectedDays.length === 0) {
        throw new ReservationError('No hay noches futuras que reasignar.', 400);
      }

      // Preparar docIds de availability para vieja y nueva cama
      const buildAvailTargets = (bedIds: string[]) => {
        const targets: Record<string, string[]> = {};
        for (const bedId of bedIds) {
          for (const dateStr of affectedDays) {
            const [y, m, d] = dateStr.split('-');
            const docId = `${bedId}_${y}-${m}`;
            if (!targets[docId]) targets[docId] = [];
            if (!targets[docId].includes(d)) targets[docId].push(d);
          }
        }
        return targets;
      };

      const oldTargets = buildAvailTargets(fromBedIds);
      const newTargets = buildAvailTargets(toBedIds);

      // Leer todos los docs de availability
      const allDocIds = new Set([...Object.keys(oldTargets), ...Object.keys(newTargets)]);
      const docRefMap = new Map<string, FirebaseFirestore.DocumentReference>();
      const docSnapMap = new Map<string, FirebaseFirestore.DocumentSnapshot>();

      for (const docId of allDocIds) {
        const ref = estRef.collection('availability').doc(docId);
        docRefMap.set(docId, ref);
        const snap = await transaction.get(ref);
        docSnapMap.set(docId, snap);
      }

      // ── PHASE 2: VALIDATE destination beds ──────────────────────────

      for (const [docId, days] of Object.entries(newTargets)) {
        const snap = docSnapMap.get(docId);
        if (!snap || !snap.exists) continue;
        const daysMap = snap.data()?.days || {};
        for (const day of days) {
          const slot = daysMap[day];
          // Rechazar si hay otro reservationId diferente al de esta stay
          if (slot && slot.reservationId !== stay.reservationId) {
            const bedId = docId.split('_')[0];
            const ym = docId.substring(docId.indexOf('_') + 1);
            throw new ReservationError(
              `No se puede realizar el cambio porque la cama ${bedId} está ocupada/reservada el ${ym}-${day}.`,
              409
            );
          }
        }
      }

      // ── PHASE 3: ALL WRITES ─────────────────────────────────────────

      // 3a. Liberar availability de camas antiguas para los días afectados
      for (const [docId, days] of Object.entries(oldTargets)) {
        const snap = docSnapMap.get(docId);
        if (!snap || !snap.exists) continue;
        const existingDays = { ...(snap.data()?.days || {}) };
        let changed = false;
        for (const day of days) {
          if (existingDays[day] && existingDays[day].reservationId === stay.reservationId) {
            delete existingDays[day];
            changed = true;
          }
        }
        if (changed) {
          transaction.update(docRefMap.get(docId)!, { days: existingDays, updatedAt: FieldValue.serverTimestamp() });
        }
      }

      // 3b. Bloquear availability de camas nuevas
      for (const [docId, days] of Object.entries(newTargets)) {
        const snap = docSnapMap.get(docId);
        const existingDays = snap?.exists ? { ...(snap.data()?.days || {}) } : {};
        const bedId = docId.split('_')[0];
        for (const day of days) {
          existingDays[day] = {
            reservationId: stay.reservationId || null,
            mode: saleMode,
          };
        }
        transaction.set(
          docRefMap.get(docId)!,
          { bedId, roomId: toRoomId, days: existingDays, updatedAt: FieldValue.serverTimestamp() },
          { merge: true }
        );
      }

      // 3c. Actualizar Stay: bedIds, roomId, movements
      const movementId = crypto.randomUUID();
      const movement = {
        id: movementId,
        type: 'room_change',
        description: `Cambio a ${toRoomId}${reason ? ` — ${reason}` : ''}`,
        fromRoomId,
        fromBedIds,
        toRoomId,
        toBedIds,
        effectiveDate,
        reason: reason || null,
        changedBy: auth.uid || '',
        changedAt: Timestamp.now(),
        createdAt: Timestamp.now(),
        createdBy: auth.uid || '',
      };

      transaction.update(stayRef, {
        roomId: toRoomId,
        bedIds: toBedIds,
        movements: FieldValue.arrayUnion(movement),
        updatedAt: FieldValue.serverTimestamp(),
      });
    });

    // Regenerar dailySummaries para los días históricos afectados (retroactivo)
    for (const dateStr of retroContext.affectedDates) {
      try {
        await processDailySummaryForEstablishment(establishmentId, dateStr);
      } catch (e) {
        console.error(`[v1.17] Error regenerando dailySummary ${dateStr}:`, e);
      }
    }

    return { success: true as const, message: 'Habitación/cama cambiada exitosamente.' };
  } catch (error: any) {
    if (error instanceof ReservationError) throw error;
    throw new ReservationError(`Error en la transacción: ${error.message}`, 500);
  }
}
