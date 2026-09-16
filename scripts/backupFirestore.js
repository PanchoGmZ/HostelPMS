const { initializeApp, cert, getApps } = require('firebase-admin/app');
const { getFirestore, Timestamp, GeoPoint, DocumentReference } = require('firebase-admin/firestore');
const fs = require('fs');
const path = require('path');

try {
  require('dotenv').config();
} catch (e) {}

if (getApps().length === 0) {
  try {
    const serviceAccount = require(path.join(__dirname, '../functions/serviceAccountKey.json'));
    initializeApp({
      credential: cert(serviceAccount),
      projectId: 'hostel-pms-e3bc9',
    });
  } catch (e) {
    initializeApp({
      projectId: 'hostel-pms-e3bc9',
    });
  }
}

const db = getFirestore();

function serializeData(data) {
  if (data === null || data === undefined) return data;
  if (data instanceof Timestamp) {
    return { __type: 'timestamp', _seconds: data.seconds, _nanoseconds: data.nanoseconds };
  }
  if (data instanceof GeoPoint) {
    return { __type: 'geopoint', latitude: data.latitude, longitude: data.longitude };
  }
  if (data instanceof DocumentReference) {
    return { __type: 'reference', path: data.path };
  }
  if (Array.isArray(data)) {
    return data.map(serializeData);
  }
  if (typeof data === 'object') {
    const res = {};
    for (const key of Object.keys(data)) {
      res[key] = serializeData(data[key]);
    }
    return res;
  }
  return data;
}

const stats = {
  totalDocs: 0,
  establishments: 0,
  rooms: 0,
  beds: 0,
  reservations: 0,
  guests: 0,
  stays: 0,
  folios: 0
};

async function exportCollection(collectionRef) {
  const snapshot = await collectionRef.get();
  const docs = [];
  
  for (const doc of snapshot.docs) {
    stats.totalDocs++;
    
    const pathParts = doc.ref.path.split('/');
    const collName = pathParts[pathParts.length - 2] || pathParts[0]; 
    
    if (collName === 'establishments') stats.establishments++;
    else if (collName === 'rooms') stats.rooms++;
    else if (collName === 'beds') stats.beds++;
    else if (collName === 'reservations') stats.reservations++;
    else if (collName === 'guests') stats.guests++;
    else if (collName === 'stays') stats.stays++;
    else if (collName === 'folios') stats.folios++;

    const serializedData = serializeData(doc.data());
    
    const subcollections = await doc.ref.listCollections();
    const subcollectionsData = {};
    for (const sub of subcollections) {
      subcollectionsData[sub.id] = await exportCollection(sub);
    }
    
    docs.push({
      id: doc.id,
      path: doc.ref.path,
      data: serializedData,
      subcollections: subcollectionsData
    });
  }
  
  return docs;
}

async function main() {
  console.log('Iniciando backup de Firestore...');
  
  const rootCollections = ['establishments', 'users'];
  const exportData = {};
  
  for (const collName of rootCollections) {
    console.log(`Exportando colección: ${collName} (y sus subcolecciones)`);
    exportData[collName] = await exportCollection(db.collection(collName));
  }
  
  const backupsDir = path.join(__dirname, '../backups');
  if (!fs.existsSync(backupsDir)) {
    fs.mkdirSync(backupsDir);
  }
  
  const now = new Date();
  const YYYY = now.getFullYear();
  const MM = String(now.getMonth() + 1).padStart(2, '0');
  const DD = String(now.getDate()).padStart(2, '0');
  const HH = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  const filename = `firestore-backup-${YYYY}-${MM}-${DD}-${HH}${mm}.json`;
  
  const outPath = path.join(backupsDir, filename);
  fs.writeFileSync(outPath, JSON.stringify(exportData, null, 2), 'utf8');
  
  const fileStats = fs.statSync(outPath);
  
  console.log('\n--- Resumen del Backup ---');
  console.log(`Archivo generado: ${filename}`);
  console.log(`Ruta completa: ${outPath}`);
  console.log(`Tamaño: ${(fileStats.size / 1024 / 1024).toFixed(2)} MB`);
  console.log(`Documentos totales exportados: ${stats.totalDocs}`);
  console.log(`- Establishments: ${stats.establishments}`);
  console.log(`- Rooms: ${stats.rooms}`);
  console.log(`- Beds: ${stats.beds}`);
  console.log(`- Reservations: ${stats.reservations}`);
  console.log(`- Guests: ${stats.guests}`);
  console.log(`- Stays: ${stats.stays}`);
  console.log(`- Folios: ${stats.folios}`);
  console.log('\nBackup completado con éxito. No se han modificado datos en Firestore.');
}

main().then(() => process.exit(0)).catch(e => { 
  console.error('Error durante el backup:', e); 
  process.exit(1); 
});
