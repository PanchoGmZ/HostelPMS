import type { Handler, HandlerEvent, HandlerContext } from '@netlify/functions';
import { verifyAuth } from '../server/src/auth/verifyAuth';
import {
  createReservationService,
  ReservationError,
} from '../server/src/services/reservations/createReservation';

export const handler: Handler = async (event: HandlerEvent, _context: HandlerContext) => {
  // --- Método ---
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Method Not Allowed' }),
    };
  }

  // --- Autenticación ---
  let authContext;
  try {
    authContext = await verifyAuth(event);
  } catch (error: any) {
    return {
      statusCode: 401,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: error.message }),
    };
  }

  // --- Parse body ---
  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch {
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Body JSON inválido.' }),
    };
  }

  // --- Ejecutar service ---
  try {
    const result = await createReservationService(payload, authContext);
    return {
      statusCode: 201,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(result),
    };
  } catch (error: any) {
    if (error instanceof ReservationError) {
      return {
        statusCode: error.httpStatus,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: error.message }),
      };
    }
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Error interno del servidor.' }),
    };
  }
};
