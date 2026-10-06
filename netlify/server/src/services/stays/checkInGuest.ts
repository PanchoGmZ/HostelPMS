import { getFirebaseAdmin } from '../../firebase/admin';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import type { AuthContext } from '../../auth/verifyAuth';
import { ReservationError } from '../reservations/createReservation';
import { processDailySummaryForEstablishment } from '../reports/generateDailySummary';

export interface CheckInInitialPayment {
  amount: number;
  method: 'cash' | 'card' | 'transfer' | 'qr';
  reference?: string | null;
  currencyCode?: string;
  receivedAmount?: number;
}

export interface CheckInGuestPayload {
  establishmentId: string;
  reservationId: string;
  guestIds: string[];
  deposit?: number;
  // v1.17: pago real en el momento del check-in
  initialPayment?: CheckInInitialPayment;
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

  const { establishmentId, reservationId, guestIds, deposit, initialPayment } = payload;

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

  // v1.12: capturar checkInDate de la reserva para detectar retroactividad después de la transacción
  const retroContext: { checkInSeconds: number | null } = { checkInSeconds: null };

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

      // Auditar checkInGuest: Exigir un primaryGuestId válido
      const titularId = reservation.primaryGuestId || (guestIds && guestIds.length > 0 ? guestIds[0] : null);
      if (!titularId || typeof titularId !== 'string' || titularId.trim() === '') {
        throw new ReservationError(
          'No se puede realizar el check-in: la reserva no tiene un huésped titular registrado. Completa los datos del huésped antes de realizar el check-in.',
          400
        );
      }

      // Validar que el titular exista en la base de datos de huéspedes
      const guestSnap = await transaction.get(estRef.collection('guests').doc(titularId));
      if (!guestSnap.exists) {
        throw new ReservationError(
          'El huésped titular asignado no existe en la base de datos de huéspedes.',
          400
        );
      }

      // v1.12: capturar para regenerar dailySummaries si es retroactivo
      if (reservation.checkInDate && typeof reservation.checkInDate.seconds === 'number') {
        retroContext.checkInSeconds = reservation.checkInDate.seconds;
      }

      // Actualizamos el status de la reserva a 'completed' indicando que ya se efectivizó
      const reservationUpdate: Record<string, unknown> = {
        status: 'completed',
        updatedAt: FieldValue.serverTimestamp(),
      };
      if (!reservation.primaryGuestId) {
        reservationUpdate.primaryGuestId = titularId;
      }
      transaction.update(reservationRef, reservationUpdate);

      transaction.set(stayRef, {
        reservationId: reservationId,
        primaryGuestId: titularId,
        guestIds: guestIds && guestIds.length > 0 ? guestIds : [titularId],
        roomId: reservation.roomId,
        bedIds: reservation.bedIds,
        checkInDate: reservation.checkInDate,
        expectedCheckOutDate: reservation.checkOutDate,
        // v1.7: guestCount siempre como número — nunca undefined en Firestore
        guestCount: typeof reservation.guestCount === 'number' ? reservation.guestCount : 1,
        actualCheckOutDate: null,
        status: 'active',
        deposit: deposit || 0,
        documentVerified: false,
        createdBy: auth.uid || '',
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });

      const lodgingAmount = typeof reservation.totalAmount === 'number' ? reservation.totalAmount : 0;
      const lodgingChargeId = db.collection('dummy').doc().id;
      // Calculate nights safely using seconds difference
      let nights = 1;
      if (reservation.checkInDate && reservation.checkOutDate) {
        nights = Math.max(1, Math.round((reservation.checkOutDate.seconds - reservation.checkInDate.seconds) / 86400));
      }

      const lodgingCharge = {
        id: lodgingChargeId,
        description: `Hospedaje · ${nights} noche(s)`,
        quantity: 1,
        unitPrice: lodgingAmount,
        amount: lodgingAmount,
        status: 'pending',
        productId: null,
        serviceDate: reservation.checkInDate, // Fecha operativa para reportes históricos/retroactivos
        createdAt: Timestamp.now(),
      };

      // v1.17: El pago inicial real de check-in tiene prioridad sobre el depósito genérico.
      // Si se envía initialPayment, se trata como pago real con método/moneda/referencia.
      // Si no, se usa deposit (legacy). Ambos se registran en payments[] del folio.
      const paymentEntries: object[] = [];
      let totalPaidInitial = 0;

      if (initialPayment && typeof initialPayment.amount === 'number' && initialPayment.amount > 0) {
        const payId = db.collection('dummy').doc().id;
        totalPaidInitial = initialPayment.amount;
        paymentEntries.push({
          id: payId,
          amount: initialPayment.amount,
          method: initialPayment.method || 'cash',
          status: 'completed',
          reference: initialPayment.reference || null,
          currencyCode: initialPayment.currencyCode || 'BOB',
          receivedAmount: typeof initialPayment.receivedAmount === 'number' ? initialPayment.receivedAmount : initialPayment.amount,
          createdAt: Timestamp.now(),
        });
      } else if (deposit && deposit > 0) {
        totalPaidInitial = deposit;
        paymentEntries.push({
          id: db.collection('dummy').doc().id,
          amount: deposit,
          method: 'deposit',
          status: 'completed',
          reference: null,
          currencyCode: 'BOB',
          receivedAmount: deposit,
          createdAt: Timestamp.now(),
        });
      }

      const initialBalance = totalPaidInitial - lodgingAmount;

      transaction.set(folioRef, {
        stayId: stayRef.id,
        reservationId: reservationId,
        currency: reservation.currency || 'BOB',
        totalCharges: lodgingAmount,
        totalPaid: totalPaidInitial,
        balance: initialBalance,
        status: 'open',
        charges: [lodgingCharge],
        payments: paymentEntries,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });

      // v1.17: Si hay pago inicial real, registrar en caja si hay turno abierto.
      if (initialPayment && typeof initialPayment.amount === 'number' && initialPayment.amount > 0) {
        const cashShiftsSnap = await transaction.get(
          estRef.collection('cashShifts').where('status', '==', 'open').limit(1)
        );
        if (cashShiftsSnap.empty) {
          throw new ReservationError('Debes abrir un turno de caja antes de registrar un pago.', 400);
        }
        
        const cashShiftRef = cashShiftsSnap.docs[0].ref;
        const movRef = cashShiftRef.collection('movements').doc();
        transaction.set(movRef, {
          type: 'payment',
          amount: initialPayment.amount,
          method: initialPayment.method || 'cash',
          currencyCode: initialPayment.currencyCode || 'BOB',
          receivedAmount: typeof initialPayment.receivedAmount === 'number' ? initialPayment.receivedAmount : initialPayment.amount,
          description: `Pago Check-in - ${stayRef.id}`,
          relatedFolioId: folioRef.id,
          createdBy: auth.uid || '',
          createdAt: FieldValue.serverTimestamp(),
        });
      }
    });

    // v1.12: Regenerar dailySummaries históricos afectados si el check-in es retroactivo.
    // Se ejecuta con await secuencial — no fire-and-forget.
    // En Netlify Functions el trabajo asíncrono después de responder puede no completarse.
    // Cada fecha se regenera de forma independiente con su propio try/catch:
    // un fallo en un reporte histórico NUNCA revierte una estadía ya confirmada.
    if (retroContext.checkInSeconds !== null) {
      const checkInJsDate = new Date(retroContext.checkInSeconds * 1000);
      // "Hoy" en America/La_Paz (UTC-04:00 sin DST)
      const boliviaFormatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/La_Paz',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      });
      const todayStr = boliviaFormatter.format(new Date());
      // checkInDate en formato YYYY-MM-DD usando timezone Bolivia
      const checkInStr = boliviaFormatter.format(checkInJsDate);

      if (checkInStr < todayStr) {
        // Construir lista de días históricos afectados: desde checkIn hasta ayer (sin incluir hoy)
        const datesToRegenerate: string[] = [];
        const cursor = new Date(`${checkInStr}T12:00:00.000-04:00`);
        const todayDate = new Date(`${todayStr}T12:00:00.000-04:00`);
        while (cursor < todayDate) {
          datesToRegenerate.push(cursor.toISOString().slice(0, 10));
          cursor.setUTCDate(cursor.getUTCDate() + 1);
        }

        // Regenerar awaited, fecha por fecha — errores individuales se loguean sin propagar
        for (const dateStr of datesToRegenerate) {
          try {
            await processDailySummaryForEstablishment(establishmentId, dateStr);
            console.log(`[v1.12] dailySummary regenerado: ${dateStr} (${establishmentId})`);
          } catch (summaryErr) {
            // El check-in ya fue confirmado; no revertir por un error de reporte histórico
            console.error(`[v1.12] Error regenerando dailySummary ${dateStr} para ${establishmentId}:`, summaryErr);
          }
        }

        if (datesToRegenerate.length > 0) {
          console.log(`[v1.12] Regeneración completada: ${datesToRegenerate.length} día(s) para ${establishmentId}: ${datesToRegenerate[0]} → ${datesToRegenerate[datesToRegenerate.length - 1]}`);
        }
      }
    }

    return { success: true as const, stayId: stayRef.id };
  } catch (error: any) {
    if (error instanceof ReservationError) {
      throw error;
    }
    throw new ReservationError(`Error en la transacción: ${error.message}`, 500);
  }
}
