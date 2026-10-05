import { getFirebaseAdmin } from '../../firebase/admin';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import type { AuthContext } from '../../auth/verifyAuth';

export interface GenerateSummaryPayload {
  establishmentId: string;
  date: string; // YYYY-MM-DD
}

export interface GenerateSummaryResult {
  success: true;
  summary: {
    dateStr: string;
    newReservationsCount: number;
    cancellationsCount: number;
    checkInsCount: number;
    checkOutsCount: number;
    totalRevenue: number;
    occupancy: number;
    revenueBOB?: number;
    paymentMethods?: Record<string, number>;
    paymentsCount?: number;
    channels?: Record<string, number>;
  };
}

export class SummaryError extends Error {
  constructor(message: string, public readonly httpStatus: number = 400) {
    super(message);
    this.name = 'SummaryError';
  }
}

export async function processDailySummaryForEstablishment(
  establishmentId: string,
  dateStr: string
) {
  const db = getFirestore();
  const estRef = db.collection('establishments').doc(establishmentId);
  const [year, month, day] = dateStr.split('-');

  // BUGFIX: El timezone original usaba UTC ('Z') causando que el día boliviano empezara a las 20:00.
  // America/La_Paz no tiene horario de verano y es siempre UTC-04:00.
  // Ajustamos el parser para que el rango coincida exactamente con las 00:00 a 23:59 locales.
  const startOfDay = new Date(`${dateStr}T00:00:00.000-04:00`);
  const endOfDay = new Date(`${dateStr}T23:59:59.999-04:00`);

  const [reservationsSnap, staysSnap, foliosSnap, roomsSnap, availSnap] = await Promise.all([
    estRef.collection('reservations').get(),
    estRef.collection('stays').get(),
    estRef.collection('folios').get(),
    estRef.collection('rooms').get(),
    estRef.collection('availability').get(),
  ]);

  // 1. Reservas creadas en el día
  const newReservationsCount = reservationsSnap.docs.filter((d) => {
    const data = d.data();
    if (!data.createdAt) return false;
    const dt = data.createdAt.toDate ? data.createdAt.toDate() : new Date(data.createdAt.seconds * 1000);
    return dt >= startOfDay && dt <= endOfDay;
  }).length;

  // 1b. Distribución por canal según fecha operativa (checkInDate)
  const channels: Record<string, number> = {};
  for (const d of reservationsSnap.docs) {
    const data = d.data();
    if (!data.checkInDate) continue;
    const dt = data.checkInDate.toDate ? data.checkInDate.toDate() : new Date(data.checkInDate.seconds * 1000);
    if (dt >= startOfDay && dt <= endOfDay) {
      const ch = data.channel || 'direct';
      channels[ch] = (channels[ch] || 0) + 1;
    }
  }

  // 2. Cancelaciones ocurridas en el día
  const cancellationsCount = reservationsSnap.docs.filter((d) => {
    const data = d.data();
    if (data.status !== 'cancelled') return false;
    const dt = data.cancelledAt
      ? (data.cancelledAt.toDate ? data.cancelledAt.toDate() : new Date(data.cancelledAt.seconds * 1000))
      : (data.updatedAt?.toDate ? data.updatedAt.toDate() : null);
    return dt && dt >= startOfDay && dt <= endOfDay;
  }).length;

  // 3. Check-ins ocurridos en el día
  const checkInsCount = staysSnap.docs.filter((d) => {
    const data = d.data();
    if (!data.checkInDate) return false;
    const dt = data.checkInDate.toDate ? data.checkInDate.toDate() : new Date(data.checkInDate.seconds * 1000);
    return dt >= startOfDay && dt <= endOfDay;
  }).length;

  // 4. Check-outs ocurridos en el día
  const checkOutsCount = staysSnap.docs.filter((d) => {
    const data = d.data();
    if (!data.actualCheckOutDate) return false;
    const dt = data.actualCheckOutDate.toDate
      ? data.actualCheckOutDate.toDate()
      : new Date(data.actualCheckOutDate.seconds * 1000);
    return dt >= startOfDay && dt <= endOfDay;
  }).length;

  // 5. Ingresos (pagos completados) y Cargos registrados en folios durante el día
  let totalPaid = 0;
  let revenueBOB = 0;
  const revenueByCurrency: Record<string, number> = {};
  const paymentMethods: Record<string, number> = {};
  let paymentsCount = 0;

  let lodgingCharges = 0;
  let consumptionCharges = 0;
  let otherCharges = 0;
  let totalCharges = 0;

  for (const folioDoc of foliosSnap.docs) {
    const folio = folioDoc.data();
    
    // Pagos
    const payments = Array.isArray(folio.payments) ? folio.payments : [];
    for (const p of payments) {
      if (p.status === 'completed' && p.createdAt && typeof p.amount === 'number') {
        const pDate = p.createdAt.toDate ? p.createdAt.toDate() : new Date(p.createdAt.seconds * 1000);
        if (pDate >= startOfDay && pDate <= endOfDay) {
          totalPaid += p.amount;
          
          const cur = p.currencyCode || 'BOB';
          const receivedAmt = typeof p.receivedAmount === 'number' ? p.receivedAmount : p.amount;
          
          if (!revenueByCurrency[cur]) revenueByCurrency[cur] = 0;
          revenueByCurrency[cur] += receivedAmt;

          if (cur === 'BOB') {
            revenueBOB += receivedAmt;
          }

          const method = p.method || 'other';
          paymentMethods[method] = (paymentMethods[method] || 0) + 1;
          paymentsCount++;
        }
      }
    }

    // Cargos
    const charges = Array.isArray(folio.charges) ? folio.charges : [];
    for (const c of charges) {
      const isLodging = c.productId === null || (c.description && c.description.toLowerCase().includes('hospedaje'));
      const isConsumption = c.productId !== null && c.productId !== undefined && !isLodging;
      
      // Para hospedaje, usamos la fecha operativa (serviceDate) si existe. Para consumos usamos createdAt.
      const dateField = (isLodging && c.serviceDate) ? c.serviceDate : c.createdAt;

      if (dateField && typeof c.amount === 'number') {
        const cDate = dateField.toDate ? dateField.toDate() : new Date(dateField.seconds * 1000);
        if (cDate >= startOfDay && cDate <= endOfDay) {
          totalCharges += c.amount;
          
          if (isLodging) {
            lodgingCharges += c.amount;
          } else if (isConsumption) {
            consumptionCharges += c.amount;
          } else {
            otherCharges += c.amount;
          }
        }
      }
    }
  }

  const outstandingBalance = totalCharges - totalPaid;

  // 6. Ocupación de camas
  const bedCountPromises = roomsSnap.docs.map(async (rDoc) => {
    const bedsSnap = await rDoc.ref.collection('beds').where('status', '==', 'active').get();
    return bedsSnap.size;
  });
  const bedCounts = await Promise.all(bedCountPromises);
  const totalBeds = bedCounts.reduce((acc, count) => acc + count, 0);

  let occupiedBedsCount = 0;
  for (const doc of availSnap.docs) {
    if (doc.id.endsWith(`_${year}-${month}`)) {
      const days = doc.data()?.days || {};
      if (days[day]) {
        occupiedBedsCount++;
      }
    }
  }

  const occupancy = totalBeds > 0 ? Math.min(100, Math.round((occupiedBedsCount / totalBeds) * 100)) : 0;

  // 7. Guardar en dailySummaries/{YYYY-MM-DD} de forma idempotente
  const summaryRef = estRef.collection('dailySummaries').doc(dateStr);
  await summaryRef.set(
    {
      id: dateStr,
      date: dateStr,
      reservations: newReservationsCount,
      cancellations: cancellationsCount,
      checkIns: checkInsCount,
      checkOuts: checkOutsCount,
      revenue: Math.round(totalPaid * 100) / 100, // Mantener para compatibilidad
      revenueBOB: Math.round(revenueBOB * 100) / 100,
      revenueByCurrency,
      paymentMethods,
      paymentsCount,
      channels,
      occupancy,
      totalBeds,
      occupiedBeds: occupiedBedsCount,
      lodgingCharges: Math.round(lodgingCharges * 100) / 100,
      consumptionCharges: Math.round(consumptionCharges * 100) / 100,
      otherCharges: Math.round(otherCharges * 100) / 100,
      totalCharges: Math.round(totalCharges * 100) / 100,
      totalPaid: Math.round(totalPaid * 100) / 100,
      outstandingBalance: Math.round(outstandingBalance * 100) / 100,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true } // Garantiza la idempotencia
  );

  return {
    dateStr,
    newReservationsCount,
    cancellationsCount,
    checkInsCount,
    checkOutsCount,
    totalRevenue: totalPaid,
    occupancy,
    revenueBOB: Math.round(revenueBOB * 100) / 100,
    paymentMethods,
    paymentsCount,
    channels,
    lodgingCharges,
    consumptionCharges,
    otherCharges,
    totalCharges,
    totalPaid,
    outstandingBalance,
  };
}

export async function generateDailySummaryOnDemandService(
  payload: GenerateSummaryPayload,
  auth: AuthContext
): Promise<GenerateSummaryResult> {
  getFirebaseAdmin();
  const { establishmentId, date } = payload;

  if (!establishmentId || !date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new SummaryError('Parámetros requeridos: establishmentId y date (formato YYYY-MM-DD).');
  }

  if (!auth.roles[establishmentId]) {
    throw new SummaryError('No tienes permisos.', 403);
  }

  try {
    const result = await processDailySummaryForEstablishment(establishmentId, date);
    return { success: true as const, summary: result };
  } catch (error: any) {
    throw new SummaryError(`Error al procesar el resumen: ${error.message}`, 500);
  }
}
