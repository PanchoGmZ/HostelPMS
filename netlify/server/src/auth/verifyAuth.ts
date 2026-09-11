import { getFirebaseAdmin } from '../firebase/admin';
import { getAuth, DecodedIdToken } from 'firebase-admin/auth';
import type { HandlerEvent } from '@netlify/functions';

export interface AuthContext {
  uid: string;
  email?: string;
  roles: Record<string, string>;
  decodedToken: DecodedIdToken;
}

/**
 * Valida el token Bearer del header Authorization
 */
export async function verifyAuth(event: HandlerEvent): Promise<AuthContext> {
  const authHeader = event.headers.authorization || event.headers.Authorization;

  if (!authHeader) {
    throw new Error('Missing Authorization header');
  }

  if (!authHeader.startsWith('Bearer ')) {
    throw new Error('Invalid Authorization header format. Expected "Bearer <token>"');
  }

  const token = authHeader.split('Bearer ')[1];
  if (!token) {
    throw new Error('Token not found in Authorization header');
  }

  try {
    getFirebaseAdmin();
    const decodedToken = await getAuth().verifyIdToken(token);
    
    // Extraer roles de custom claims si existen
    const roles = decodedToken.roles || {};

    return {
      uid: decodedToken.uid,
      email: decodedToken.email,
      roles,
      decodedToken,
    };
  } catch (error: any) {
    throw new Error(`Authentication failed: ${error.message}`);
  }
}
