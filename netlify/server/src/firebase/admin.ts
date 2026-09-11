import { getApps, getApp, initializeApp, cert } from 'firebase-admin/app';

/**
 * Inicializador singleton para Firebase Admin
 */
export function getFirebaseAdmin() {
  if (getApps().length > 0) {
    return getApp();
  }

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  let privateKey = process.env.FIREBASE_PRIVATE_KEY;

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error('Faltan variables de entorno requeridas para Firebase Admin (FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY)');
  }

  // Las variables de entorno de Netlify inyectan \n como texto plano, debemos reemplazarlo
  privateKey = privateKey.replace(/\\n/g, '\n');

  return initializeApp({
    credential: cert({
      projectId,
      clientEmail,
      privateKey,
    }),
  });
}
