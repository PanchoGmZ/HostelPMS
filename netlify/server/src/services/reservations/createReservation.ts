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
  commissionPercent?: number;
  guestCount?: number;
  guestIds?: string[];
  // v1.7: pricing mode
  pricingMode?: 'standard' | 'manual';
  manualPricePerNight?: number;
  manualTotalAmount?: number; // v1.9: total manual
  specialRateReason?: string;
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
    commissionPercent,
    guestCount,
    guestIds,
    pricingMode = 'standard',
    manualPricePerNight,
    manualTotalAmount,
    specialRateReason,
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

  // v1.7/v1.9: validar tarifa manual
  if (pricingMode === 'manual') {
    if (manualTotalAmount !== undefined) {
      if (typeof manualTotalAmount !== 'number' || !isFinite(manualTotalAmount) || manualTotalAmount < 0) {
        throw new ReservationError('Precio total manual inválido. Debe ser un número >= 0.');
      }
    } else if (manualPricePerNight !== undefined) {
      if (typeof manualPricePerNight !== 'number' || !isFinite(manualPricePerNight) || manualPricePerNight < 0) {
        throw new ReservationError('Precio manual por noche inválido. Debe ser un número >= 0.');
      }
    } else {
      throw new ReservationError('Precio manual requerido.');
    }
    if (!specialRateReason || typeof specialRateReason !== 'string' || specialRateReason.trim() === '') {
      throw new ReservationError('Se requiere un motivo para la tarifa especial.');
    }
  }

  // --- Autorización: el caller debe pertenecer al staff de ESTE establecimiento ---
  if (!auth.roles[establishmentId]) {
    throw new ReservationError('No pertenecés al staff de este establecimiento.', 403);
  }

  // --- Pre-validate dates from pricePerNight structure ---
  const perBedDates: { [bedId: string]: string[] } = {};

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

  let finalTotalAmount = 0;
  const finalPricePerNight: Record<string, Record<string, number>> = {};

  try {
    await db.runTransaction(async (transaction) => {
      // 0. Validar la pertenencia y el estado de la habitación y sus camas.
      const estSnap = await transaction.get(estRef);
      if (!estSnap.exists) throw new Error('El establecimiento no existe.');
      const roomRef = estRef.collection('rooms').doc(roomId);
      const roomSnap = await transaction.get(roomRef);
      if (!roomSnap.exists)
        throw new Error('La habitación no existe en este establecimiento.');
      const room = roomSnap.data() || {};
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
      
      // v1.7: guestCount siempre como número, nunca undefined
      // bed → 1, full_room → guestCount del payload o 1 como fallback seguro
      const resolvedGuestCount: number =
        saleMode === 'bed'
          ? 1
          : typeof guestCount === 'number' && guestCount >= 1
            ? Math.min(guestCount, room.maxGuests ?? 99)
            : 1;

      // Calculate server-side pricing
      let commissionRate = 0;
      let finalCommissionPercent = 0;
      if (channel === 'booking' || channel === 'airbnb') {
        const cp = typeof commissionPercent === 'number' ? commissionPercent : 0;
        if (cp >= 0 && cp <= 100) {
          commissionRate = cp / 100;
          finalCommissionPercent = cp;
        }
      }

      for (const bedId of bedIds) {
        finalPricePerNight[bedId] = {};
        const bedSnap = bedSnaps.find(snap => snap.id === bedId);
        const bed = bedSnap?.data() || {};
        const dates = perBedDates[bedId];
        
        let basePrice = 0;

        if (pricingMode === 'manual') {
          // v1.9: usar manualTotalAmount si está presente
          let effManualPricePerNight = manualPricePerNight as number;
          if (typeof manualTotalAmount === 'number') {
             const totalChargeableUnits = saleMode === 'full_room' ? expectedDates.length : (expectedDates.length * bedIds.length);
             effManualPricePerNight = totalChargeableUnits > 0 ? manualTotalAmount / totalChargeableUnits : 0;
          }

          // v1.7: tarifa especial — usar precio manual como base
          // Solo la primera cama lleva el precio en full_room, el resto = 0
          if (saleMode === 'full_room') {
            basePrice = bedId === bedIds[0] ? effManualPricePerNight : 0;
          } else {
            basePrice = effManualPricePerNight;
          }
        } else if (saleMode === 'full_room' && room.type === 'private') {
          // For private rooms, we assign the full price to the first bed
          if (bedId === bedIds[0]) {
            const countStr = String(resolvedGuestCount);
            basePrice = room.priceByGuestCount?.[countStr] ?? room.basePriceRoom ?? 0;
          } else {
            basePrice = 0; // Other beds in private room are blocked but cost 0
          }
        } else {
          basePrice = bed.basePriceBed ?? room.basePriceRoom ?? 0;
        }

        // v1.7: comisión OTA — si tarifa es 0, el resultado sigue siendo 0
        const nightlyPrice = basePrice * (1 + commissionRate);

        for (const d of dates) {
          finalPricePerNight[bedId][d] = nightlyPrice;
          finalTotalAmount += nightlyPrice;
        }
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
        const bedDates = perBedDates[bedId];
        transaction.set(lineRef, {
          bedId,
          roomId,
          saleMode,
          dateFrom: Timestamp.fromDate(new Date(`${bedDates[0]}T00:00:00.000-04:00`)),
          dateTo: Timestamp.fromDate(new Date(`${bedDates[bedDates.length - 1]}T00:00:00.000-04:00`)),
          guestId: guestId || null,
          pricePerNight: finalPricePerNight[bedId], // snapshot histórico server-side
          status: 'active',
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });
      }

      // 5. Crear la reserva (con totalAmount calculado, no confiado del cliente)
      // v1.7: snapshot histórico de pricing — todos los campos siempre como valores explícitos
      const reservationDoc: Record<string, unknown> = {
        channel,
        status: 'confirmed',
        primaryGuestId: guestId || null,
        guestIds: guestIds && guestIds.length > 0 ? guestIds : (guestId ? [guestId] : []),
        roomId,
        bedIds,
        checkInDate,
        checkOutDate,
        totalAmount: finalTotalAmount,
        currency,
        // v1.7: guestCount siempre número — nunca undefined
        guestCount: resolvedGuestCount,
        // v1.7: comisión siempre número
        commissionPercent: finalCommissionPercent,
        // v1.7: snapshot histórico de pricing
        pricingMode,
        // manualPricePerNight: guardar null si es standard, número si es manual
        manualPricePerNight: pricingMode === 'manual' && typeof manualPricePerNight === 'number' ? manualPricePerNight : null,
        manualTotalAmount: pricingMode === 'manual' && typeof manualTotalAmount === 'number' ? manualTotalAmount : null,
        // specialRateReason: guardar null si no aplica
        specialRateReason: pricingMode === 'manual' && specialRateReason ? specialRateReason.trim() : null,
        createdBy: callerUid,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      };

      transaction.set(reservationRef, reservationDoc);
    });

    return { success: true as const, reservationId: reservationRef.id, totalAmount: finalTotalAmount };
  } catch (error: any) {
    // Detectar errores de disponibilidad para mapearlos a 409
    if (error.message && error.message.includes('ya está ocupada')) {
      throw new ReservationError(error.message, 409);
    }
    throw new ReservationError(`Error en la transacción: ${error.message}`, 500);
  }
}
