/**
 * seedProduction.js
 * Seed definitivo para hostel Pata y Perro.
 * - 10 rooms, 28 beds (20x 1_plaza, 8x 2_plazas)
 * - 2 admin users (Auth + Firestore + Custom Claims)
 * - bookingChannels reales
 * - products/categories vacíos (el cliente los carga)
 * Requiere: serviceAccountKey.json en functions/
 * Requiere: scripts/seed.production.local.env
 */

const { initializeApp, cert, getApps } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { getAuth } = require('firebase-admin/auth');
const path = require('path');
const fs = require('fs');

// Cargar credenciales del archivo local
const envPath = path.join(__dirname, 'seed.production.local.env');
if (!fs.existsSync(envPath)) {
  console.error('ABORT: No se encontró scripts/seed.production.local.env');
  process.exit(1);
}
const envLines = fs.readFileSync(envPath, 'utf8').split('\n');
const env = {};
for (const line of envLines) {
  const [key, ...rest] = line.split('=');
  if (key && rest.length) env[key.trim()] = rest.join('=').trim();
}

const ADMIN_USERS = [
  { email: env['ADMIN_1_EMAIL'], password: env['ADMIN_1_PASSWORD'] },
  { email: env['ADMIN_2_EMAIL'], password: env['ADMIN_2_PASSWORD'] },
];
if (ADMIN_USERS.some(u => !u.email || !u.password)) {
  console.error('ABORT: Faltan credenciales en seed.production.local.env');
  process.exit(1);
}

// ============================================================================
// CONFIG
// ============================================================================
const PROJECT_ID = 'hostel-pms-e3bc9';
const ESTABLISHMENT_ID = 'est_hostel_principal';

if (getApps().length === 0) {
  const serviceAccount = require(path.join(__dirname, '../functions/serviceAccountKey.json'));
  initializeApp({ credential: cert(serviceAccount), projectId: PROJECT_ID });
}

const db = getFirestore();
const auth = getAuth();

// ============================================================================
// DATOS REALES
// ============================================================================
const ESTABLISHMENT_CONFIG = {
  name: 'Pata y Perro',
  address: 'TODO_REPLACE_DIRECCION',
  timezone: 'America/La_Paz',
  currency: 'BOB',
  checkInTime: '14:00',
  checkOutTime: '10:00',
  lateCheckoutSurchargePercent: 50,
};

function bed(id, label, bedType) {
  return { id, label, bedType, basePriceBed: 100, status: 'active', outOfServiceReason: null };
}

const ROOMS = [
  {
    id: 'room-19-andina', name: '19 - ANDINA', floor: '1', type: 'dorm', basePriceRoom: 100, amenities: [],
    beds: [
      bed('bed-19-andina-01', 'Cama 1', '1_plaza'),
      bed('bed-19-andina-02', 'Cama 2', '1_plaza'),
      bed('bed-19-andina-03', 'Cama 3', '1_plaza'),
      bed('bed-19-andina-04', 'Cama 4', '1_plaza'),
    ]
  },
  {
    id: 'room-18-guarani', name: '18 - GUARANI', floor: '1', type: 'dorm', basePriceRoom: 100, amenities: [],
    beds: [
      bed('bed-18-guarani-01', 'Cama 1', '1_plaza'),
      bed('bed-18-guarani-02', 'Cama 2', '1_plaza'),
      bed('bed-18-guarani-03', 'Cama 3', '1_plaza'),
      bed('bed-18-guarani-04', 'Cama 4', '1_plaza'),
    ]
  },
  {
    id: 'room-17-tarijena', name: '17 - TARIJEÑA', floor: '1', type: 'dorm', basePriceRoom: 100, amenities: [],
    beds: [
      bed('bed-17-tarijena-01', 'Cama 1', '1_plaza'),
      bed('bed-17-tarijena-02', 'Cama 2', '1_plaza'),
      bed('bed-17-tarijena-03', 'Cama 3', '1_plaza'),
      bed('bed-17-tarijena-04', 'Cama 4', '1_plaza'),
    ]
  },
  {
    id: 'room-13-oriental', name: '13 - ORIENTAL', floor: '1', type: 'dorm', basePriceRoom: 100, amenities: [],
    beds: [
      bed('bed-13-oriental-01', 'Cama 1', '1_plaza'),
      bed('bed-13-oriental-02', 'Cama 2', '1_plaza'),
      bed('bed-13-oriental-03', 'Cama 3', '2_plazas'),
    ]
  },
  {
    id: 'room-latina', name: 'LATINA', floor: '1', type: 'dorm', basePriceRoom: 100, amenities: [],
    beds: [
      bed('bed-latina-01', 'Cama 1', '1_plaza'),
      bed('bed-latina-02', 'Cama 2', '1_plaza'),
      bed('bed-latina-03', 'Cama 3', '1_plaza'),
      bed('bed-latina-04', 'Cama 4', '1_plaza'),
    ]
  },
  {
    id: 'room-pachi', name: 'PACHI', floor: '1', type: 'dorm', basePriceRoom: 100, amenities: [],
    beds: [
      bed('bed-pachi-01', 'Cama 1', '2_plazas'),
      bed('bed-pachi-02', 'Cama 2', '2_plazas'),
    ]
  },
  {
    id: 'room-8', name: '8', floor: '1', type: 'dorm', basePriceRoom: 100, amenities: [],
    beds: [
      bed('bed-8-01', 'Cama 1', '1_plaza'),
      bed('bed-8-02', 'Cama 2', '1_plaza'),
      bed('bed-8-03', 'Cama 3', '2_plazas'),
    ]
  },
  {
    id: 'room-9', name: '9', floor: '1', type: 'dorm', basePriceRoom: 100, amenities: [],
    beds: [
      bed('bed-9-01', 'Cama 1', '2_plazas'),
      bed('bed-9-02', 'Cama 2', '2_plazas'),
    ]
  },
  {
    id: 'room-10', name: '10', floor: '1', type: 'private', basePriceRoom: 100, amenities: [],
    beds: [
      bed('bed-10-01', 'Cama 1', '2_plazas'),
    ]
  },
  {
    id: 'room-11', name: '11', floor: '1', type: 'private', basePriceRoom: 100, amenities: [],
    beds: [
      bed('bed-11-01', 'Cama 1', '2_plazas'),
    ]
  },
];

const BOOKING_CHANNELS = [
  { id: 'channel_direct',    name: 'Directo',         commissionPercent: 0, active: true },
  { id: 'channel_reception', name: 'Recepción',        commissionPercent: 0, active: true },
  { id: 'channel_whatsapp',  name: 'WhatsApp',         commissionPercent: 0, active: true },
  { id: 'channel_social',    name: 'Instagram/Redes',  commissionPercent: 0, active: true },
  { id: 'channel_booking',   name: 'Booking.com',      commissionPercent: 0, active: true },
  { id: 'channel_airbnb',    name: 'Airbnb',           commissionPercent: 0, active: true },
];

// ============================================================================
// UPSERT HELPER
// ============================================================================
async function upsertDoc(ref, data) {
  const snap = await ref.get();
  const payload = { ...data, updatedAt: FieldValue.serverTimestamp() };
  if (!snap.exists) payload.createdAt = FieldValue.serverTimestamp();
  await ref.set(payload, { merge: true });
}

// ============================================================================
// SEED ROOMS
// ============================================================================
async function seedRooms() {
  const estRef = db.collection('establishments').doc(ESTABLISHMENT_ID);
  for (const room of ROOMS) {
    const roomRef = estRef.collection('rooms').doc(room.id);
    await upsertDoc(roomRef, {
      name: room.name,
      floor: room.floor,
      type: room.type,
      basePriceRoom: room.basePriceRoom,
      bedCount: room.beds.length,
      status: 'active',
      amenities: room.amenities,
    });
    for (const b of room.beds) {
      const bedRef = roomRef.collection('beds').doc(b.id);
      await upsertDoc(bedRef, {
        label: b.label,
        bedType: b.bedType,
        basePriceBed: b.basePriceBed,
        status: b.status,
        outOfServiceReason: b.outOfServiceReason,
      });
    }
  }
}

// ============================================================================
// SEED CHANNELS
// ============================================================================
async function seedChannels() {
  const estRef = db.collection('establishments').doc(ESTABLISHMENT_ID);
  for (const ch of BOOKING_CHANNELS) {
    await upsertDoc(estRef.collection('bookingChannels').doc(ch.id), {
      name: ch.name,
      commissionPercent: ch.commissionPercent,
      active: ch.active,
    });
  }
}

// ============================================================================
// SEED AUTH USERS
// ============================================================================
async function seedAuthUser(email, password) {
  let userRecord;
  let created = false;
  try {
    userRecord = await auth.getUserByEmail(email);
    // Usuario ya existe -> actualizar password
    await auth.updateUser(userRecord.uid, { password, emailVerified: true });
  } catch (err) {
    if (err.code === 'auth/user-not-found') {
      userRecord = await auth.createUser({ email, password, emailVerified: true });
      created = true;
    } else {
      throw err;
    }
  }

  // Merge roles sin pisar otros establishments
  const existingClaims = (userRecord.customClaims ?? {});
  const existingRoles = existingClaims.roles ?? {};
  const mergedRoles = { ...existingRoles, [ESTABLISHMENT_ID]: 'admin' };
  await auth.setCustomUserClaims(userRecord.uid, { ...existingClaims, roles: mergedRoles });

  // Espejo Firestore
  const userRef = db.collection('users').doc(userRecord.uid);
  await upsertDoc(userRef, { email, roles: mergedRoles, active: true });

  return { uid: userRecord.uid, email, created };
}

// ============================================================================
// VALIDATE
// ============================================================================
async function validate() {
  const estRef = db.collection('establishments').doc(ESTABLISHMENT_ID);
  const roomsSnap = await estRef.collection('rooms').get();
  let beds1 = 0, beds2 = 0;
  for (const r of roomsSnap.docs) {
    const bedsSnap = await r.ref.collection('beds').get();
    for (const b of bedsSnap.docs) {
      const bt = b.data().bedType;
      if (bt === '1_plaza') beds1++;
      else if (bt === '2_plazas') beds2++;
    }
  }

  const [gSnap, rSnap, stSnap, foSnap, csSnap, puSnap, smSnap] = await Promise.all([
    estRef.collection('guests').get(),
    estRef.collection('reservations').get(),
    estRef.collection('stays').get(),
    estRef.collection('folios').get(),
    estRef.collection('cashShifts').get(),
    estRef.collection('purchases').get(),
    estRef.collection('stockMovements').get(),
  ]);

  return {
    rooms: roomsSnap.size,
    beds1Plaza: beds1,
    beds2Plazas: beds2,
    physicalBeds: beds1 + beds2,
    guests: gSnap.size,
    reservations: rSnap.size,
    stays: stSnap.size,
    folios: foSnap.size,
    cashShifts: csSnap.size,
    purchases: puSnap.size,
    stockMovements: smSnap.size,
  };
}

// ============================================================================
// MAIN
// ============================================================================
async function main() {
  console.log('\n=== SEED DE PRODUCCIÓN — Pata y Perro ===');
  console.log(`Project: ${PROJECT_ID} | Establishment: ${ESTABLISHMENT_ID}\n`);

  // 1. Establishment
  console.log('→ Seeding establishment...');
  await upsertDoc(db.collection('establishments').doc(ESTABLISHMENT_ID), ESTABLISHMENT_CONFIG);

  // 2. Rooms + Beds
  console.log('→ Seeding rooms y beds...');
  await seedRooms();

  // 3. Booking Channels
  console.log('→ Seeding booking channels...');
  await seedChannels();

  // 4. Auth Users
  console.log('→ Configurando usuarios admin...');
  const userResults = [];
  for (const u of ADMIN_USERS) {
    const result = await seedAuthUser(u.email, u.password);
    userResults.push(result);
    console.log(`   ${result.created ? 'Creado' : 'Actualizado'}: ${result.email} (uid: ${result.uid})`);
  }

  // 5. Validación
  console.log('\n→ Validando...');
  const stats = await validate();

  // Assertions
  const pass = (
    stats.rooms === 10 &&
    stats.beds1Plaza === 20 &&
    stats.beds2Plazas === 8 &&
    stats.physicalBeds === 28 &&
    stats.guests === 0 &&
    stats.reservations === 0 &&
    stats.stays === 0 &&
    stats.folios === 0
  );

  console.log('\n=== VALIDACIÓN ===');
  console.log(`Rooms:       ${stats.rooms}/10      ${stats.rooms === 10 ? '✓' : '✗'}`);
  console.log(`Beds 1 plaza: ${stats.beds1Plaza}/20    ${stats.beds1Plaza === 20 ? '✓' : '✗'}`);
  console.log(`Beds 2 plazas:${stats.beds2Plazas}/8     ${stats.beds2Plazas === 8 ? '✓' : '✗'}`);
  console.log(`Total beds:  ${stats.physicalBeds}/28    ${stats.physicalBeds === 28 ? '✓' : '✗'}`);
  console.log(`Guests:      ${stats.guests} (esperado 0)  ${stats.guests === 0 ? '✓' : '✗'}`);
  console.log(`Reservations:${stats.reservations} (esperado 0) ${stats.reservations === 0 ? '✓' : '✗'}`);
  console.log(`Stays:       ${stats.stays} (esperado 0) ${stats.stays === 0 ? '✓' : '✗'}`);
  console.log(`Folios:      ${stats.folios} (esperado 0) ${stats.folios === 0 ? '✓' : '✗'}`);
  console.log(`CashShifts:  ${stats.cashShifts} (esperado 0) ${stats.cashShifts === 0 ? '✓' : '✗'}`);
  console.log(`Purchases:   ${stats.purchases} (esperado 0) ${stats.purchases === 0 ? '✓' : '✗'}`);
  console.log(`StockMovements:${stats.stockMovements} (esperado 0) ${stats.stockMovements === 0 ? '✓' : '✗'}`);
  console.log(`Usuarios Admin:${userResults.length}/2  ${userResults.length === 2 ? '✓' : '✗'}`);
  console.log(`\nRESULTADO: ${pass ? 'PASS ✓' : 'FAIL ✗'}`);
  console.log('=================\n');

  if (!pass) process.exit(1);

  return { stats, userResults };
}

main().then(() => process.exit(0)).catch(e => {
  console.error('\nERROR EN SEED:', e.message);
  process.exit(1);
});
