import { getFirebaseAdmin } from '../../firebase/admin';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import type { AuthContext } from '../../auth/verifyAuth';

export interface SetUserRolePayload {
  targetUid: string;
  establishmentId: string;
  role: string;
}

export interface SetUserRoleResult {
  success: true;
  message: string;
}

export class UserRoleError extends Error {
  constructor(message: string, public readonly httpStatus: number = 400) {
    super(message);
    this.name = 'UserRoleError';
  }
}

export async function setUserRoleService(
  payload: SetUserRolePayload,
  authContext: AuthContext
): Promise<SetUserRoleResult> {
  getFirebaseAdmin();
  const auth = getAuth();
  const db = getFirestore();

  const { targetUid, establishmentId, role } = payload;

  if (!targetUid || !establishmentId || !role) {
    throw new UserRoleError('Faltan parámetros requeridos: targetUid, establishmentId, role.');
  }

  if (role !== 'admin' && role !== 'reception') {
    throw new UserRoleError("El rol debe ser 'admin' o 'reception'.");
  }

  const isCallerAdmin = authContext.roles[establishmentId] === 'admin';
  if (!isCallerAdmin) {
    throw new UserRoleError('No tienes permisos de administrador para este establecimiento.', 403);
  }

  try {
    const targetUser = await auth.getUser(targetUid);
    const existingClaims = targetUser.customClaims || {};
    const existingRoles = existingClaims.roles || {};

    const updatedRoles = {
      ...existingRoles,
      [establishmentId]: role,
    };

    await auth.setCustomUserClaims(targetUid, {
      ...existingClaims,
      roles: updatedRoles,
    });

    await db.collection('users').doc(targetUid).set(
      {
        roles: updatedRoles,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    return {
      success: true as const,
      message: `Rol '${role}' asignado con éxito para el establecimiento ${establishmentId}.`,
    };
  } catch (error: any) {
    if (error.code === 'auth/user-not-found') {
      throw new UserRoleError('El usuario objetivo no existe.', 404);
    }
    throw new UserRoleError(`Error interno del servidor: ${error.message}`, 500);
  }
}
