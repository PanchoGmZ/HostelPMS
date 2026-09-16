import { getFirebaseAdmin } from '../../firebase/admin';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import type { AuthContext } from '../../auth/verifyAuth';

// ============================================================================
// Payload y respuesta
// ============================================================================
export interface CreateReservationPayload {
  establishmentId: string;
  guestId?: string;
  saleMode: 'bed' | 'full_room';
  roomId: string;
  bedIds: string[];
  checkIn?: string;
  checkOut?: string;
  checkInDate?: string;
  checkOutDate?: string;
  pricePerNight: Record<string, Record<string, number>>;
  channel?: string;
}

export interface CreateReservationResult {
  success: true;
  reservationId: string;
  totalAmount: number;
}

// ============================================================================
// Errores de dominio
// ============================================================================
export class ReservationError extends Error {
  constructor(
    message: string,
    public readonly httpStatus: number = 400
  ) {
    super(message);
    this.name = 'ReservationError';
  }
}

// ============================================================================
// Service: createReservation
// ============================================================================
export async function createReservationService(
  payload: CreateReservationPayload,
  auth: AuthContext
): Promise<CreateReservationResult> {
  getFirebaseAdmin();
  const db = getFirestore();

  const {
    establishmentId,
    guestId,
    saleMode,
    roomId,
    bedIds,
    pricePerNight,
    channel = 'direct',
  } = payload;
  const requestedCheckIn = payload.checkIn ?? payload.checkInDate;
  const requestedCheckOut = payload.checkOut ?? payload.checkOutDate;
  const callerUid = auth.uid;

  // --- Validaciones de entrada ---
  if (!establishmentId || !roomId || !Array.isArray(bedIds) || bedIds.length === 0) {
    throw new ReservationError(
      'Faltan parámetros de reserva obligatorios (establishmentId, roomId, bedIds).'
    );
  }
  if (saleMode !== 'bed' && saleMode !== 'full_room') {
    throw new ReservationError("saleMode debe ser 'bed' o 'full_room'.");
  }
  if (!pricePerNight || typeof pricePerNight !== 'object') {
    throw new ReservationError('Falta el detalle de precios por noche (pricePerNight) por cama.');
  }
  if (
    new Set(bedIds).size !== bedIds.length ||
    bedIds.some((bedId: unknown) => typeof bedId !== 'string' || (bedId as string).length === 0)
  ) {
    throw new ReservationError('bedIds debe contener identificadores únicos y válidos.');
  }

  // --- Autorización: el caller debe pertenecer al staff de ESTE establecimiento ---
  if (!auth.roles[establishmentId]) {
    throw new ReservationError('No pertenecés al staff de este establecimiento.', 403);
  }

  // --- Validar precios por cama y calcular el total server-side ---
  const perBedDates: { [bedId: string]: string[] } = {};
  let totalAmount = 0;

  for (const bedId of bedIds) {
    const bedPrices = pricePerNight[bedId];
    if (!bedPrices || typeof bedPrices !== 'object' || Object.keys(bedPrices).length === 0) {
      throw new ReservationError(`Faltan precios por noche para la cama ${bedId}.`);
    }
    const dates = Object.keys(bedPrices).sort();
    for (const d of dates) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) {
        throw new ReservationError(`Fecha inválida para la cama ${bedId}: ${d}.`);
      }
      const price = bedPrices[d];
      if (typeof price !== 'number' || !Number.isFinite(price) || price < 0) {
        throw new ReservationError(`Precio inválido para la cama ${bedId} en la fecha ${d}.`);
      }
      totalAmount += price;
    }
    perBedDates[bedId] = dates;
  }

  const allDates = Array.from(new Set(bedIds.flatMap((bedId) => perBedDates[bedId]))).sort();
  if (allDates.length === 0) {
    throw new ReservationError('La reserva debe tener al menos una noche.');
  }
  const firstDate = requestedCheckIn || allDates[0];
  let lastDate = requestedCheckOut;
  if (!lastDate) {
    // Usamos UTC a las 12:00 para evitar cualquier boundary issue al sumar un día
    const impliedCheckOut = new Date(`${allDates[allDates.length - 1]}T12:00:00.000Z`);
    impliedCheckOut.setUTCDate(impliedCheckOut.getUTCDate() + 1);
    lastDate = impliedCheckOut.toISOString().slice(0, 10);
  }
  // Helper explícito para parsear YYYY-MM-DD a medianoche de America/La_Paz (UTC-4)
  const parseDateLocal = (value: unknown): Date | null => {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
    // Forzamos el offset -04:00 (Bolivia)
    // Esto crea un Date equivalente a YYYY-MM-DD 04:00:00 UTC
    const date = new Date(`${value}T00:00:00.000-04:00`);
    return Number.isNaN(date.getTime()) ? null : date;
  };
  const checkInJsDate = parseDateLocal(firstDate);
  const checkOutJsDate = parseDateLocal(lastDate);
  if (!checkInJsDate || !checkOutJsDate || checkInJsDate >= checkOutJsDate) {
    throw new ReservationError('El rango de fechas es inválido.');
  }
  const expectedDates: string[] = [];
  for (
    const date = new Date(checkInJsDate);
    date < checkOutJsDate;
    date.setUTCDate(date.getUTCDate() + 1)
  ) {
    expectedDates.push(date.toISOString().slice(0, 10));
  }
  const expectedDateSet = new Set(expectedDates);
  if (
    allDates.length !== expectedDates.length ||
    allDates.some((date, index) => date !== expectedDates[index])
  ) {
    throw new ReservationError(
      'pricePerNight debe cubrir exactamente todas las noches, sin huecos ni fechas fuera del rango.'
    );
  }
  for (const bedId of bedIds) {
    const dates = perBedDates[bedId];
    if (dates.length !== expectedDates.length || dates.some((date) => !expectedDateSet.has(date))) {
      throw new ReservationError(`pricePerNight incompleto para la cama ${bedId}.`);
    }
  }
  const checkInDate = Timestamp.fromDate(checkInJsDate);
  const checkOutDate = Timestamp.fromDate(checkOutJsDate);

  const estRef = db.collection('establishments').doc(establishmentId);
  const reservationRef = estRef.collection('reservations').doc();

  // Un solo ID de línea por cama, generado antes de la transacción
  const lineRefByBed: { [bedId: string]: FirebaseFirestore.DocumentReference } = {};
  for (const bedId of bedIds) {
    lineRefByBed[bedId] = reservationRef.collection('lines').doc();
  }

  try {
    await db.runTransaction(async (transaction) => {
      // 0. Validar la pertenencia y el estado de la habitación y sus camas.
      const estSnap = await transaction.get(estRef);
      if (!estSnap.exists) throw new Error('El establecimiento no existe.');
      const roomRef = estRef.collection('rooms').doc(roomId);
      const roomSnap = await transaction.get(roomRef);
      if (!roomSnap.exists)
        throw new Error('La habitación no existe en este establecimiento.');
      const bedRefs = bedIds.map((bedId) => roomRef.collection('beds').doc(bedId));
      const bedSnaps = await Promise.all(bedRefs.map((ref) => transaction.get(ref)));
      const allBedsSnap = await transaction.get(roomRef.collection('beds'));
      const invalidBed = bedSnaps.findIndex((bedSnap) => {
        const bed = bedSnap.data() || {};
        return (
          !bedSnap.exists ||
          bed.status !== 'active' ||
          (bed.outOfServiceReason != null && bed.outOfServiceReason !== '')
        );
      });
      if (invalidBed !== -1)
        throw new Error(
          `La cama ${bedIds[invalidBed]} no existe o no está disponible para venta.`
        );
      const activeBedIds = allBedsSnap.docs
        .filter((bedSnap) => {
          const bed = bedSnap.data();
          return (
            bed.status === 'active' &&
            (bed.outOfServiceReason == null || bed.outOfServiceReason === '')
          );
        })
        .map((bedSnap) => bedSnap.id)
        .sort();
      if (
        saleMode === 'full_room' &&
        (activeBedIds.length !== bedIds.length ||
          activeBedIds.some((id, index) => id !== [...bedIds].sort()[index]))
      ) {
        throw new Error(
          'full_room debe incluir exactamente todas las camas activas de la habitación.'
        );
      }
      const currency = estSnap.data()?.currency || 'BOB';

      // 1. Determinar buckets de availability a leer (bedId + yearMonth)
      const availabilityTargets: { [docId: string]: { bedId: string; days: string[] } } = {};
      for (const bedId of bedIds) {
        for (const dateStr of perBedDates[bedId]) {
          const [year, month, day] = dateStr.split('-');
          const yearMonth = `${year}-${month}`;
          const docId = `${bedId}_${yearMonth}`;
          if (!availabilityTargets[docId]) {
            availabilityTargets[docId] = { bedId, days: [] };
          }
          availabilityTargets[docId].days.push(day);
        }
      }

      const docIds = Object.keys(availabilityTargets);
      const docRefs = docIds.map((docId) => estRef.collection('availability').doc(docId));
      const snapshots = await Promise.all(docRefs.map((ref) => transaction.get(ref)));

      // 2. Validar que no haya conflictos (ninguna cama ocupada esos días)
      snapshots.forEach((snap, i) => {
        const docId = docIds[i];
        const target = availabilityTargets[docId];
        const daysMap = (snap.exists ? snap.data()?.days : {}) || {};
        for (const day of target.days) {
          if (daysMap[day] != null) {
            throw new Error(`La cama ${target.bedId} ya está ocupada el día ${day}.`);
          }
        }
      });

      // 3. Escribir/actualizar los buckets de availability
      snapshots.forEach((snap, i) => {
        const docId = docIds[i];
        const docRef = docRefs[i];
        const target = availabilityTargets[docId];
        const existingDays = (snap.exists ? snap.data()?.days : {}) || {};
        const updatedDays = { ...existingDays };
        const lineRef = lineRefByBed[target.bedId];

        for (const day of target.days) {
          updatedDays[day] = {
            reservationId: reservationRef.id,
            reservationLineId: lineRef.id,
            mode: saleMode,
          };
        }

        transaction.set(
          docRef,
          {
            bedId: target.bedId,
            roomId,
            days: updatedDays,
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
      });

      // 4. Crear reservations/{id}/lines/{lineId}
      for (const bedId of bedIds) {
        const lineRef = lineRefByBed[bedId];
        const bedPrices = pricePerNight[bedId];
        const bedDates = perBedDates[bedId];
        transaction.set(lineRef, {
          bedId,
          roomId,
          saleMode,
          dateFrom: Timestamp.fromDate(new Date(`${bedDates[0]}T00:00:00.000-04:00`)),
          dateTo: Timestamp.fromDate(new Date(`${bedDates[bedDates.length - 1]}T00:00:00.000-04:00`)),
          guestId: guestId || null,
          pricePerNight: bedPrices, // snapshot histórico
          status: 'active',
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });
      }

      // 5. Crear la reserva (con totalAmount calculado, no confiado del cliente)
      transaction.set(reservationRef, {
        channel,
        status: 'confirmed',
        primaryGuestId: guestId || null,
        guestIds: guestId ? [guestId] : [],
        roomId,
        bedIds,
        checkInDate,
        checkOutDate,
        totalAmount,
        currency,
        createdBy: callerUid,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
    });

    return { success: true as const, reservationId: reservationRef.id, totalAmount };
  } catch (error: any) {
    // Detectar errores de disponibilidad para mapearlos a 409
    if (error.message && error.message.includes('ya está ocupada')) {
      throw new ReservationError(error.message, 409);
    }
    throw new ReservationError(`Error en la transacción: ${error.message}`, 500);
  }
}
