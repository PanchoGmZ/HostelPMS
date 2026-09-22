import { getFirebaseAdmin } from '../../firebase/admin';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import type { AuthContext } from '../../auth/verifyAuth';
import { ReservationError } from './createReservation';

// v1.7: campos modificables con recalculo de precio
export interface ModifyReservationPayload {
  establishmentId: string;
  reservationId: string;
  // Campos modificables
  primaryGuestId?: string;
  guestIds?: string[];
  channel?: string;
  commissionPercent?: number;
  guestCount?: number;
  pricingMode?: 'standard' | 'manual';
  manualPricePerNight?: number;
  specialRateReason?: string;
}

export interface ModifyReservationResult {
  success: true;
  message: string;
  newTotalAmount?: number;
}

export async function modifyReservationService(
  payload: ModifyReservationPayload,
  auth: AuthContext
): Promise<ModifyReservationResult> {
  getFirebaseAdmin();
  const db = getFirestore();

  const {
    establishmentId,
    reservationId,
    primaryGuestId,
    guestIds,
    channel,
    commissionPercent,
    guestCount,
    pricingMode,
    manualPricePerNight,
    specialRateReason,
  } = payload;

  if (!establishmentId || !reservationId) {
    throw new ReservationError('Parámetros requeridos faltantes.', 400);
  }

  if (!auth.roles[establishmentId]) {
    throw new ReservationError('No tienes permisos.', 403);
  }

  // v1.7: validar precio manual si aplica
  const effectivePricingMode = pricingMode;
  if (effectivePricingMode === 'manual') {
    if (manualPricePerNight === null || manualPricePerNight === undefined || typeof manualPricePerNight !== 'number' || !isFinite(manualPricePerNight) || manualPricePerNight < 0) {
      throw new ReservationError('Precio manual inválido. Debe ser un número >= 0.', 400);
    }
    if (!specialRateReason || typeof specialRateReason !== 'string' || specialRateReason.trim() === '') {
      throw new ReservationError('Se requiere un motivo para la tarifa especial.', 400);
    }
  }

  const estRef = db.collection('establishments').doc(establishmentId);
  const reservationRef = estRef.collection('reservations').doc(reservationId);

  // Determinar si hay cambios que requieren recalculo del precio
  const needsPriceRecalc =
    channel !== undefined ||
    commissionPercent !== undefined ||
    guestCount !== undefined ||
    pricingMode !== undefined ||
    manualPricePerNight !== undefined;

  let newTotalAmount: number | undefined;

  try {
    await db.runTransaction(async (transaction) => {
      const resSnap = await transaction.get(reservationRef);
      if (!resSnap.exists) {
        throw new ReservationError('La reserva no existe.', 404);
      }

      const reservation = resSnap.data();
      if (!reservation) throw new ReservationError('Datos de reserva inválidos.', 500);

      if (reservation.status !== 'confirmed') {
        throw new ReservationError('Solo se pueden modificar reservas confirmadas (pre-check-in).', 409);
      }

      // Snapshot anterior para history
      const prevTotalAmount = reservation.totalAmount;
      const prevPricingMode = reservation.pricingMode ?? 'standard';
      const prevManualPricePerNight = reservation.manualPricePerNight ?? null;

      // Construir objeto de actualización con campos explícitos
      const updates: Record<string, unknown> = {};

      // Campos simples
      if (primaryGuestId !== undefined) {
        updates.primaryGuestId = primaryGuestId || null;
      }
      if (guestIds !== undefined) {
        updates.guestIds = Array.isArray(guestIds) ? guestIds.filter(id => typeof id === 'string' && id.trim() !== '') : [];
      }
      if (channel !== undefined) {
        updates.channel = channel;
      }

      // Pricing mode snapshot
      const finalPricingMode: 'standard' | 'manual' = pricingMode ?? (reservation.pricingMode ?? 'standard') as 'standard' | 'manual';
      const finalChannel = channel !== undefined ? channel : (reservation.channel ?? 'direct');
      const finalGuestCount = guestCount !== undefined ? guestCount : (typeof reservation.guestCount === 'number' ? reservation.guestCount : 1);
      const finalCommissionPercent = commissionPercent !== undefined ? commissionPercent : (typeof reservation.commissionPercent === 'number' ? reservation.commissionPercent : 0);

      // v1.7: recalcular precio si hay cambios que lo afectan
      if (needsPriceRecalc) {
        // Leer habitación para precios
        const roomRef = estRef.collection('rooms').doc(reservation.roomId);
        const roomSnap = await transaction.get(roomRef);
        const room = roomSnap.exists ? (roomSnap.data() || {}) : {};

        const saleMode: string = reservation.saleMode ?? (reservation.bedIds?.length > 1 ? 'full_room' : 'bed');

        // Calcular comisión OTA
        let commissionRate = 0;
        let resolvedCommissionPercent = 0;
        if (finalChannel === 'booking' || finalChannel === 'airbnb') {
          const cp = typeof finalCommissionPercent === 'number' ? finalCommissionPercent : 0;
          if (cp >= 0 && cp <= 100) {
            commissionRate = cp / 100;
            resolvedCommissionPercent = cp;
          }
        }

        // v1.7: validar guestCount no exceda maxGuests
        const resolvedGuestCount = saleMode === 'bed' ? 1 : Math.min(
          typeof finalGuestCount === 'number' && finalGuestCount >= 1 ? finalGuestCount : 1,
          room.maxGuests ?? 99
        );

        // Calcular precio base según pricingMode
        let basePrice = 0;
        if (finalPricingMode === 'manual') {
          // v1.7: precio manual congelado — comprobación explícita de null/undefined
          const mPrice = manualPricePerNight !== undefined && manualPricePerNight !== null
            ? manualPricePerNight
            : (reservation.manualPricePerNight !== undefined && reservation.manualPricePerNight !== null
              ? reservation.manualPricePerNight
              : 0);
          basePrice = mPrice;
        } else if (saleMode === 'full_room' && room.type === 'private') {
          const countStr = String(resolvedGuestCount);
          basePrice = room.priceByGuestCount?.[countStr] ?? room.basePriceRoom ?? 0;
        } else {
          // Para bed mode: precio promedio de las camas asignadas
          // Leer primera cama para obtener precio base
          const bedIds: string[] = Array.isArray(reservation.bedIds) ? reservation.bedIds : [];
          if (bedIds.length > 0) {
            const firstBedRef = roomRef.collection('beds').doc(bedIds[0]);
            const firstBedSnap = await transaction.get(firstBedRef);
            const firstBed = firstBedSnap.exists ? (firstBedSnap.data() || {}) : {};
            basePrice = firstBed.basePriceBed ?? room.basePriceRoom ?? 0;
          }
        }

        // v1.7: precio noche con comisión — 0 * cualquier_cosa = 0
        const nightlyPrice = basePrice * (1 + commissionRate);

        // Calcular total: noches * precio noche
        // Usamos las líneas existentes para saber cuántas noches y camas
        const nights = reservation.checkInDate && reservation.checkOutDate
          ? Math.round((reservation.checkOutDate.seconds - reservation.checkInDate.seconds) / (60 * 60 * 24))
          : 0;

        const bedIds: string[] = Array.isArray(reservation.bedIds) ? reservation.bedIds : [];
        // En full_room solo la primera cama lleva precio, las demás son 0
        // En bed: cada cama lleva precio
        const pricingBedCount = saleMode === 'full_room' ? 1 : bedIds.length;
        newTotalAmount = nightlyPrice * nights * pricingBedCount;

        updates.totalAmount = newTotalAmount;
        updates.guestCount = resolvedGuestCount;
        updates.commissionPercent = resolvedCommissionPercent;
        updates.pricingMode = finalPricingMode;
        // v1.7: guardar siempre null en lugar de undefined para campos opcionales
        updates.manualPricePerNight = finalPricingMode === 'manual' && (manualPricePerNight !== undefined && manualPricePerNight !== null)
          ? manualPricePerNight
          : (finalPricingMode === 'manual' && reservation.manualPricePerNight !== undefined ? reservation.manualPricePerNight : null);
        updates.specialRateReason = finalPricingMode === 'manual'
          ? (specialRateReason?.trim() ?? reservation.specialRateReason ?? null)
          : null;
      } else {
        // Sin recalculo — actualizar pricingMode/reason si vienen
        if (pricingMode !== undefined) {
          updates.pricingMode = pricingMode;
          updates.manualPricePerNight = pricingMode === 'manual' && typeof manualPricePerNight === 'number' ? manualPricePerNight : null;
          updates.specialRateReason = pricingMode === 'manual' && specialRateReason ? specialRateReason.trim() : null;
        }
      }

      updates.updatedAt = FieldValue.serverTimestamp();

      transaction.update(reservationRef, updates);

      // v1.7: registrar en history si hubo cambio de precio
      if (needsPriceRecalc && newTotalAmount !== undefined) {
        const historyRef = reservationRef.collection('history').doc();
        transaction.set(historyRef, {
          event: 'reservation_modified',
          prevTotalAmount,
          newTotalAmount,
          prevPricingMode,
          newPricingMode: finalPricingMode,
          prevManualPricePerNight,
          newManualPricePerNight: updates.manualPricePerNight ?? null,
          specialRateReason: updates.specialRateReason ?? null,
          modifiedBy: auth.uid,
          modifiedAt: FieldValue.serverTimestamp(),
        });
      }
    });

    return {
      success: true as const,
      message: 'Reserva modificada exitosamente.',
      ...(newTotalAmount !== undefined ? { newTotalAmount } : {}),
    };
  } catch (error: any) {
    if (error instanceof ReservationError) {
      throw error;
    }
    throw new ReservationError(`Error en la transacción: ${error.message}`, 500);
  }
}
