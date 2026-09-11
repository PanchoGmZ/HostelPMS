/**
 * ============================================================================
 * Seeder — PMS Hostel (Firebase Admin SDK)
 * ============================================================================
 *
 * Ejecución:
 *   cd functions
 *   npm run seed
 *
 * Requiere variables de entorno:
 *   GOOGLE_APPLICATION_CREDENTIALS  (ruta a service-account.json)
 *   SEED_ADMIN_EMAIL
 *   SEED_ADMIN_PASSWORD
 *   SEED_INCLUDE_DEMO_DATA          (opcional, "true"/"false", default "false")
 *
 * REGLAS DE DISEÑO (ver informe-seeder.md para el detalle completo):
 *   - Solo Firebase Admin SDK. Nunca Client SDK. Bypassea Security Rules.
 *   - IDs deterministas en todos los documentos. Nunca .doc() sin ID.
 *   - Idempotente: se puede correr múltiples veces sin duplicar ni pisar
 *     createdAt. Nunca hace batch.delete() ni borra datos existentes.
 *   - NO crea documentos en `availability` (es un índice transaccional que
 *     solo debe originarse desde createReservation / reconciliación).
 *   - NO crea reservations, lines, stays, folios, charges, payments,
 *     cashShifts, stockMovements de venta, ni auditLogs. Son datos
 *     transaccionales y quedan fuera del alcance de este Seeder.
 *   - Los valores marcados // TODO_REPLACE son provisionales y deben
 *     reemplazarse con datos reales del hostel antes de producción.
 * ============================================================================
 */

import * as admin from 'firebase-admin';
import * as path from 'path';
// ----------------------------------------------------------------------------
// Inicialización Admin SDK
// ----------------------------------------------------------------------------

if (admin.apps.length === 0) {
  try {
    // Intenta cargar la clave privada si existe en la carpeta functions
    const serviceAccount = require(path.join(__dirname, '../serviceAccountKey.json'));
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      projectId: 'hostel-pms-e3bc9',
    });
  } catch (e) {
    // Si no encuentra el archivo JSON, usa el Project ID por defecto
    admin.initializeApp({
      projectId: 'hostel-pms-e3bc9',
    });
  }
}

const db = admin.firestore();
const auth = admin.auth();

// ----------------------------------------------------------------------------
// Configuración / constantes
// ----------------------------------------------------------------------------

const ESTABLISHMENT_ID = 'est_hostel_principal';
const INCLUDE_DEMO_DATA = process.env.SEED_INCLUDE_DEMO_DATA === 'true';
const MAX_BATCH_OPS = 450; // margen bajo el límite real de 500 de Firestore

// ⚠️ VALORES PROVISIONALES — reemplazar con datos reales del cliente.
const ESTABLISHMENT_CONFIG = {
  name: 'TODO_REPLACE_NOMBRE_HOSTEL',
  address: 'TODO_REPLACE_DIRECCION',
  timezone: 'America/La_Paz',
  currency: 'BOB',
  checkInTime: '14:00', // TODO_REPLACE si corresponde
  checkOutTime: '10:00', // TODO_REPLACE si corresponde
  lateCheckoutSurchargePercent: 50, // TODO_REPLACE si corresponde
};

interface SeedBed {
  id: string;
  label: string;
  basePriceBed: number;
}

interface SeedRoom {
  id: string;
  name: string;
  floor: string;
  type: 'private' | 'dorm';
  basePriceRoom: number;
  beds: SeedBed[];
}

// ⚠️ DATOS DEMO — estructura de ejemplo, NO asumir cantidad/precios reales.
const DEMO_ROOMS: SeedRoom[] = [
  {
    id: 'room_101',
    name: 'Habitación 101 (DEMO)',
    floor: '1',
    type: 'dorm',
    basePriceRoom: 0, // TODO_REPLACE
    beds: [
      { id: 'bed_101_a', label: 'Cama A', basePriceBed: 0 }, // TODO_REPLACE
      { id: 'bed_101_b', label: 'Cama B', basePriceBed: 0 },
      { id: 'bed_101_c', label: 'Cama C', basePriceBed: 0 },
      { id: 'bed_101_d', label: 'Cama D', basePriceBed: 0 },
    ],
  },
  {
    id: 'room_102',
    name: 'Habitación 102 (DEMO)',
    floor: '1',
    type: 'private',
    basePriceRoom: 0, // TODO_REPLACE
    beds: [{ id: 'bed_102_a', label: 'Cama única', basePriceBed: 0 }],
  },
];

const CATEGORIES = [
  { id: 'category_beverages', name: 'Bebidas', parentId: null },
  { id: 'category_snacks', name: 'Snacks', parentId: null },
  { id: 'category_services', name: 'Servicios', parentId: null },
];

interface SeedProduct {
  id: string;
  name: string;
  categoryId: string;
  unit: string;
  costPrice: number;
  salePrice: number;
  minimumStock: number;
}

// ⚠️ DATOS DEMO — precios en 0 a propósito, no se inventan cifras reales.
const DEMO_PRODUCTS: SeedProduct[] = [
  {
    id: 'product_water_001',
    name: 'Agua embotellada 600ml (DEMO)',
    categoryId: 'category_beverages',
    unit: 'unidad',
    costPrice: 0, // TODO_REPLACE
    salePrice: 0, // TODO_REPLACE
    minimumStock: 5, // TODO_REPLACE
  },
  {
    id: 'product_beer_001',
    name: 'Cerveza (DEMO)',
    categoryId: 'category_beverages',
    unit: 'unidad',
    costPrice: 0,
    salePrice: 0,
    minimumStock: 5,
  },
  {
    id: 'product_snack_001',
    name: 'Snack salado (DEMO)',
    categoryId: 'category_snacks',
    unit: 'unidad',
    costPrice: 0,
    salePrice: 0,
    minimumStock: 5,
  },
];

// Estructural (viene del enum fijo del negocio), comisiones sí son provisionales.
const BOOKING_CHANNELS = [
  { id: 'channel_direct', name: 'Directo', commissionPercent: 0, active: true },
  { id: 'channel_reception', name: 'Recepción', commissionPercent: 0, active: true },
  { id: 'channel_whatsapp', name: 'WhatsApp', commissionPercent: 0, active: true },
  { id: 'channel_social', name: 'Instagram/Redes', commissionPercent: 0, active: true },
  { id: 'channel_booking', name: 'Booking.com', commissionPercent: 0, active: true }, // TODO_REPLACE comisión real
  { id: 'channel_airbnb', name: 'Airbnb', commissionPercent: 0, active: true }, // TODO_REPLACE comisión real
];

const DEMO_GUEST = {
  id: 'guest_demo_001',
  firstName: 'DEMO',
  lastName: 'Huésped de Prueba',
  documentType: 'passport',
  documentNumber: 'DEMO-0000000',
  nationality: 'DEMO',
  birthDate: null,
  whatsapp: '00000000',
  email: null,
  occupation: null,
  previousCity: null,
  nextCity: null,
  emergencyContact: null,
  notes: 'Registro de prueba generado por el Seeder (SEED_INCLUDE_DEMO_DATA=true). Seguro de eliminar.',
  searchName: 'demo huésped de prueba',
};

// ----------------------------------------------------------------------------
// Helper: BatchWriter con chunking automático
// ----------------------------------------------------------------------------

class BatchWriter {
  private batch: FirebaseFirestore.WriteBatch;
  private opsInCurrentBatch = 0;
  private pendingBatches: FirebaseFirestore.WriteBatch[] = [];
  private totalOps = 0;

  constructor(private readonly firestore: FirebaseFirestore.Firestore) {
    this.batch = firestore.batch();
  }

  set(
    ref: FirebaseFirestore.DocumentReference,
    data: FirebaseFirestore.DocumentData,
    options: FirebaseFirestore.SetOptions = { merge: true }
  ): void {
    this.batch.set(ref, data, options);
    this.opsInCurrentBatch += 1;
    this.totalOps += 1;

    if (this.opsInCurrentBatch >= MAX_BATCH_OPS) {
      this.pendingBatches.push(this.batch);
      this.batch = this.firestore.batch();
      this.opsInCurrentBatch = 0;
    }
  }

  async commit(): Promise<void> {
    if (this.opsInCurrentBatch > 0) {
      this.pendingBatches.push(this.batch);
    }
    for (const b of this.pendingBatches) {
      await b.commit();
    }
    this.pendingBatches = [];
    this.batch = this.firestore.batch();
    this.opsInCurrentBatch = 0;
  }

  get totalOperations(): number {
    return this.totalOps;
  }
}

// ----------------------------------------------------------------------------
// Helper: upsert idempotente que preserva createdAt
// ----------------------------------------------------------------------------

async function upsertMany<T extends { id: string }>(
  collectionRef: FirebaseFirestore.CollectionReference,
  items: T[],
  toData: (item: T) => FirebaseFirestore.DocumentData,
  bw: BatchWriter
): Promise<void> {
  if (items.length === 0) return;

  const refs = items.map((item) => collectionRef.doc(item.id));
  const snaps = await db.getAll(...refs);

  items.forEach((item, i) => {
    const exists = snaps[i]?.exists ?? false;
    const data = toData(item);
    const payload: FirebaseFirestore.DocumentData = {
      ...data,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    if (!exists) {
      payload.createdAt = admin.firestore.FieldValue.serverTimestamp();
    }
    bw.set(refs[i], payload, { merge: true });
  });
}

// ----------------------------------------------------------------------------
// Helper: manejo de etapas con reporte claro de fallos
// ----------------------------------------------------------------------------

async function runStage<T>(name: string, fn: () => Promise<T>): Promise<T> {
  process.stdout.write(`-> ${name}...\n`);
  try {
    const result = await fn();
    process.stdout.write(`   OK: ${name}\n`);
    return result;
  } catch (err) {
    process.stderr.write(`   FALLO en la etapa: ${name}\n`);
    throw err;
  }
}

// ----------------------------------------------------------------------------
// Seed: datos maestros (batch, idempotente)
// ----------------------------------------------------------------------------

async function seedMasterData(): Promise<void> {
  const bw = new BatchWriter(db);
  const estRef = db.collection('establishments').doc(ESTABLISHMENT_ID);

  await runStage('Establecimiento', async () => {
    await upsertMany(
      db.collection('establishments'),
      [{ id: ESTABLISHMENT_ID, ...ESTABLISHMENT_CONFIG }],
      (item) => {
        const { id, ...rest } = item;
        return rest;
      },
      bw
    );
  });

  await runStage('Habitaciones y camas (DEMO)', async () => {
    const roomsCollection = estRef.collection('rooms');
    const roomItems = DEMO_ROOMS.map((room) => ({
      id: room.id,
      name: room.name,
      floor: room.floor,
      type: room.type,
      basePriceRoom: room.basePriceRoom,
      bedCount: room.beds.length, // siempre derivado, nunca hardcodeado
      status: 'active' as const,
      amenities: [] as string[],
    }));
    await upsertMany(
      roomsCollection,
      roomItems,
      (item) => {
        const { id, ...rest } = item;
        return rest;
      },
      bw
    );

    for (const room of DEMO_ROOMS) {
      const bedsCollection = roomsCollection.doc(room.id).collection('beds');
      const bedItems = room.beds.map((bed) => ({
        id: bed.id,
        label: bed.label,
        basePriceBed: bed.basePriceBed,
        status: 'active' as const,
        outOfServiceReason: null,
      }));
      await upsertMany(
        bedsCollection,
        bedItems,
        (item) => {
          const { id, ...rest } = item;
          return rest;
        },
        bw
      );
    }
  });

  await runStage('Categorías', async () => {
    await upsertMany(
      estRef.collection('categories'),
      CATEGORIES,
      (item) => {
        const { id, ...rest } = item;
        return rest;
      },
      bw
    );
  });

  await runStage('Productos base (DEMO, stock en 0)', async () => {
    const productItems = DEMO_PRODUCTS.map((p) => {
      const currentStock = 0;
      return {
        ...p,
        currentStock,
        lowStock: currentStock <= p.minimumStock,
        active: true,
      };
    });
    await upsertMany(
      estRef.collection('products'),
      productItems,
      (item) => {
        const { id, ...rest } = item;
        return rest;
      },
      bw
    );
  });

  await runStage('Canales de reserva', async () => {
    await upsertMany(
      estRef.collection('bookingChannels'),
      BOOKING_CHANNELS,
      (item) => {
        const { id, ...rest } = item;
        return rest;
      },
      bw
    );
  });

  if (INCLUDE_DEMO_DATA) {
    await runStage('Huésped demo (SEED_INCLUDE_DEMO_DATA=true)', async () => {
      await upsertMany(
        estRef.collection('guests'),
        [DEMO_GUEST],
        (item) => {
          const { id, ...rest } = item;
          return rest;
        },
        bw
      );
    });
  } else {
    process.stdout.write('-> Huésped demo OMITIDO (SEED_INCLUDE_DEMO_DATA no es "true").\n');
  }

  await runStage('Commit de batches', async () => {
    await bw.commit();
  });
}

// ----------------------------------------------------------------------------
// Seed: usuario administrador (Auth + Firestore + Custom Claims)
// ----------------------------------------------------------------------------

interface AdminSeedResult {
  uid: string;
  created: boolean;
}

async function seedAdminUser(): Promise<AdminSeedResult> {
  const email = process.env.SEED_ADMIN_EMAIL;
  const password = process.env.SEED_ADMIN_PASSWORD;

  if (!email || !password) {
    throw new Error(
      'Faltan variables de entorno obligatorias: SEED_ADMIN_EMAIL y/o SEED_ADMIN_PASSWORD.'
    );
  }

  let userRecord: admin.auth.UserRecord;
  let created = false;

  try {
    userRecord = await auth.getUserByEmail(email);
  } catch (err: unknown) {
    const code = (err as { code?: string })?.code;
    if (code === 'auth/user-not-found') {
      userRecord = await auth.createUser({ email, password, emailVerified: false });
      created = true;
    } else {
      throw err;
    }
  }

  // Merge de roles existentes: nunca pisar establecimientos que el usuario
  // ya pudiera tener asignados.
  const existingClaims = (userRecord.customClaims ?? {}) as { roles?: Record<string, string> };
  const mergedRoles: Record<string, string> = {
    ...(existingClaims.roles ?? {}),
    [ESTABLISHMENT_ID]: 'admin',
  };
  await auth.setCustomUserClaims(userRecord.uid, { ...existingClaims, roles: mergedRoles });

  const userRef = db.collection('users').doc(userRecord.uid);
  const snap = await userRef.get();
  const payload: FirebaseFirestore.DocumentData = {
    email,
    roles: mergedRoles,
    active: true,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };
  if (!snap.exists) {
    payload.createdAt = admin.firestore.FieldValue.serverTimestamp();
    payload.displayName = 'Administrador'; // TODO_REPLACE
    payload.phone = ''; // TODO_REPLACE
  }
  await userRef.set(payload, { merge: true });

  return { uid: userRecord.uid, created };
}

// ----------------------------------------------------------------------------
// Resumen final (sin datos sensibles)
// ----------------------------------------------------------------------------

interface SeedSummary {
  rooms: number;
  beds: number;
  categories: number;
  products: number;
  channels: number;
  guests: number;
}

async function buildSummary(): Promise<SeedSummary> {
  const estRef = db.collection('establishments').doc(ESTABLISHMENT_ID);
  const [roomsSnap, categoriesSnap, productsSnap, channelsSnap, guestsSnap] = await Promise.all([
    estRef.collection('rooms').get(),
    estRef.collection('categories').get(),
    estRef.collection('products').get(),
    estRef.collection('bookingChannels').get(),
    estRef.collection('guests').get(),
  ]);

  let bedsCount = 0;
  for (const roomDoc of roomsSnap.docs) {
    const bedsSnap = await roomDoc.ref.collection('beds').get();
    bedsCount += bedsSnap.size;
  }

  return {
    rooms: roomsSnap.size,
    beds: bedsCount,
    categories: categoriesSnap.size,
    products: productsSnap.size,
    channels: channelsSnap.size,
    guests: guestsSnap.size,
  };
}

function printSummary(summary: SeedSummary, adminResult: AdminSeedResult): void {
  console.log('');
  console.log('================ SEED COMPLETADO ================');
  console.log(`Establishment: 1 (${ESTABLISHMENT_ID})`);
  console.log(`Rooms: ${summary.rooms}`);
  console.log(`Beds: ${summary.beds}`);
  console.log(`Categories: ${summary.categories}`);
  console.log(`Products: ${summary.products}`);
  console.log(`Booking Channels: ${summary.channels}`);
  console.log(`Guests (demo incluido si aplica): ${summary.guests}`);
  console.log('');
  console.log(`Admin: ${adminResult.created ? 'created' : 'already exists'}`);
  console.log('===================================================');
  console.log('');
  console.log(
    'Recordatorio: revisá los campos marcados TODO_REPLACE en seed.ts antes de usar en producción.'
  );
}

// ----------------------------------------------------------------------------
// Main
// ----------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log('== Iniciando Seeder PMS Hostel ==');
  console.log(`Establecimiento objetivo: ${ESTABLISHMENT_ID}`);
  console.log(`Datos demo incluidos: ${INCLUDE_DEMO_DATA ? 'SI' : 'NO'}`);
  console.log('');

  await seedMasterData();

  const adminResult = await runStage('Usuario administrador', () => seedAdminUser());

  const summary = await runStage('Verificación post-seed', () => buildSummary());

  printSummary(summary, adminResult);
}

main()
  .then(() => {
    console.log('Seeder finalizado correctamente.');
    process.exit(0);
  })
  .catch((err) => {
    console.error('');
    console.error('ERROR: el Seeder terminó con errores. No asumas que los datos quedaron completos.');
    console.error(err);
    process.exit(1);
  });