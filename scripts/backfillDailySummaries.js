const { initializeApp, cert, getApps } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const path = require('path');

if (getApps().length === 0) {
  const serviceAccount = require(path.join(__dirname, '../functions/serviceAccountKey.json'));
  initializeApp({
    credential: cert(serviceAccount),
    projectId: 'hostel-pms-e3bc9',
  });
}

const db = getFirestore();

async function processDailySummaryForEstablishment(establishmentId, dateStr) {
  const estRef = db.collection('establishments').doc(establishmentId);
  const [year, month, day] = dateStr.split('-');

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
  const channels = {};
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

  // 5. Ingresos (pagos completados) registrados en folios durante el día
  let totalRevenue = 0;
  let revenueBOB = 0;
  const revenueByCurrency = {};
  const paymentMethods = {};
  let paymentsCount = 0;

  for (const folioDoc of foliosSnap.docs) {
    const folio = folioDoc.data();
    const payments = Array.isArray(folio.payments) ? folio.payments : [];
    for (const p of payments) {
      if (p.status === 'completed' && p.createdAt && typeof p.amount === 'number') {
        const pDate = p.createdAt.toDate ? p.createdAt.toDate() : new Date(p.createdAt.seconds * 1000);
        if (pDate >= startOfDay && pDate <= endOfDay) {
          totalRevenue += p.amount;

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
      revenueBOB: Math.round(revenueBOB * 100) / 100,
      revenueByCurrency,
      paymentMethods,
      paymentsCount,
      channels,
      occupancy,
      totalBeds,
      occupiedBeds: occupiedBedsCount,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  return {
    dateStr,
    newReservationsCount,
    cancellationsCount,
    checkInsCount,
    checkOutsCount,
    totalRevenue,
    occupancy,
    revenueBOB: Math.round(revenueBOB * 100) / 100,
    paymentMethods,
    paymentsCount,
    channels,
  };
}

async function runBackfill() {
  const establishmentId = 'est_hostel_principal';
  const estRef = db.collection('establishments').doc(establishmentId);

  console.log(`Iniciando auditoría y backfill único para establishment: ${establishmentId}`);

  // 1. Obtener SOLO los dailySummaries que YA existen actualmente
  const dsSnap = await estRef.collection('dailySummaries').orderBy('__name__', 'asc').get();
  const existingDates = dsSnap.docs.map((d) => d.id);

  console.log(`Documentos existentes encontrados: ${existingDates.length}`);
  console.log(`Fechas existentes:`, existingDates);

  // 2. Procesar únicamente las fechas existentes
  for (const dateStr of existingDates) {
    process.stdout.write(`Regenerando summary para ${dateStr}... `);
    const res = await processDailySummaryForEstablishment(establishmentId, dateStr);
    console.log(
      `OK (revBOB: ${res.revenueBOB}, occ: ${res.occupancy}%, channels: ${JSON.stringify(res.channels)}, payMethods: ${JSON.stringify(res.paymentMethods)})`
    );
  }

  // 3. Verificación post-backfill
  console.log('\n--- VERIFICACIÓN POST-BACKFILL ---');
  const postSnap = await estRef.collection('dailySummaries').get();
  let completeCount = 0;
  let incompleteCount = 0;

  postSnap.docs.forEach((doc) => {
    const data = doc.data();
    const hasAll =
      'revenueBOB' in data &&
      'paymentMethods' in data &&
      'paymentsCount' in data &&
      'channels' in data;
    if (hasAll) {
      completeCount++;
    } else {
      incompleteCount++;
      console.warn(`Doc ${doc.id} aún carece de campos`);
    }
  });

  console.log(`Total summaries: ${postSnap.size}`);
  console.log(`Summaries con todos los campos v1.13: ${completeCount}`);
  console.log(`Summaries incompletos: ${incompleteCount}`);
  console.log(`Resultado final: ${incompleteCount === 0 ? 'PASS' : 'FAIL'}`);
}

runBackfill().catch((err) => {
  console.error('Error durante el backfill:', err);
  process.exit(1);
});
