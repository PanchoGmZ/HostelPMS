/**
 * resetFirestore.js
 * Elimina datos operativos/demo bajo establishments/est_hostel_principal
 * NO borra Firebase Auth ni usuarios de otros establishments.
 * NO elimina bookingChannels (se conservan y re-seedean).
 * Requiere: serviceAccountKey.json en functions/
 */

const { initializeApp, cert, getApps } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const path = require('path');
const fs = require('fs');

// ============================================================================
// PREFLIGHT
// ============================================================================
const PROJECT_ID = 'hostel-pms-e3bc9';
const ESTABLISHMENT_ID = 'est_hostel_principal';
const BACKUP_DIR = path.join(__dirname, '../backups');

function preflight() {
  console.log('\n=== PREFLIGHT CHECKS ===');

  // 1. Verificar backup existe
  if (!fs.existsSync(BACKUP_DIR)) {
    throw new Error('ABORT: Directorio backups/ no existe. Ejecuta el backup primero.');
  }
  const backupFiles = fs.readdirSync(BACKUP_DIR).filter(f => f.endsWith('.json'));
  if (backupFiles.length === 0) {
    throw new Error('ABORT: No se encontró ningún archivo de backup.');
  }
  const latestBackup = backupFiles.sort().at(-1);
  const backupPath = path.join(BACKUP_DIR, latestBackup);
  const backupContent = fs.readFileSync(backupPath, 'utf8');
  JSON.parse(backupContent); // Valida que sea JSON parseable
  const backupSize = fs.statSync(backupPath).size;
  if (backupSize === 0) throw new Error('ABORT: Backup tiene tamaño 0.');
  console.log(`  ✓ Backup verificado: ${latestBackup} (${(backupSize/1024).toFixed(1)} KB)`);

  console.log(`  ✓ Project ID: ${PROJECT_ID}`);
  console.log(`  ✓ Establishment: ${ESTABLISHMENT_ID}`);
  console.log('=== PREFLIGHT OK ===\n');
}

// Init Firebase Admin
if (getApps().length === 0) {
  const serviceAccount = require(path.join(__dirname, '../functions/serviceAccountKey.json'));
  initializeApp({ credential: cert(serviceAccount), projectId: PROJECT_ID });
}
const db = getFirestore();

// ============================================================================
// DELETE HELPERS
// ============================================================================

/**
 * Borra todos los documentos de una colección, incluyendo sus subcolecciones.
 */
async function deleteCollection(collRef) {
  const snap = await collRef.get();
  if (snap.empty) return 0;
  let total = 0;
  for (const docSnap of snap.docs) {
    // Eliminar subcolecciones primero
    const subcollections = await docSnap.ref.listCollections();
    for (const sub of subcollections) {
      total += await deleteCollection(sub);
    }
    await docSnap.ref.delete();
    total++;
  }
  return total;
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  preflight();

  const estRef = db.collection('establishments').doc(ESTABLISHMENT_ID);

  // Colecciones operativas a borrar completamente (con subcolecciones)
  const collectionsToDelete = [
    'availability',
    'guests',
    'reservations',
    'waitlist',
    'stays',
    'folios',
    'purchases',
    'stockMovements',
    'cashShifts',
    'cleaningTasks',
    'maintenanceIncidents',
    'dailySummaries',
    'auditLogs',
    'rooms',
    'products',
    'categories',
    'suppliers',
    'promotions',
    'ratePlans',
  ];

  console.log('=== INICIANDO RESET ===');
  let totalDeleted = 0;
  for (const collName of collectionsToDelete) {
    const deleted = await deleteCollection(estRef.collection(collName));
    if (deleted > 0) console.log(`  Eliminados ${deleted} docs de ${collName}`);
    totalDeleted += deleted;
  }

  console.log(`\n  Total documentos eliminados: ${totalDeleted}`);
  console.log('=== RESET COMPLETADO ===\n');
}

main().then(() => process.exit(0)).catch(e => {
  console.error('\nERROR EN RESET:', e.message);
  process.exit(1);
});
