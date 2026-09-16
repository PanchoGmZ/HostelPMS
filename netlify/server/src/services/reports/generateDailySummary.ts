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

  // 5. Ingresos (pagos completados) registrados en folios durante el día
  let totalRevenue = 0;
  for (const folioDoc of foliosSnap.docs) {
    const folio = folioDoc.data();
    const payments = Array.isArray(folio.payments) ? folio.payments : [];
    for (const p of payments) {
      if (p.status === 'completed' && p.createdAt && typeof p.amount === 'number') {
        const pDate = p.createdAt.toDate ? p.createdAt.toDate() : new Date(p.createdAt.seconds * 1000);
        if (pDate >= startOfDay && pDate <= endOfDay) {
          totalRevenue += p.amount; // Los refunds tienen amount negativo, así que se restan automáticamente
        }
      }
    }
  }

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
      revenue: Math.round(totalRevenue * 100) / 100,
      occupancy,
      totalBeds,
      occupiedBeds: occupiedBedsCount,
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
    totalRevenue,
    occupancy,
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
