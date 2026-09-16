import type { Handler, HandlerEvent, HandlerContext } from '@netlify/functions';
import { verifyAuth } from '../server/src/auth/verifyAuth';
import { ConsumptionError } from '../server/src/services/folios/addConsumption';
import { addConsumptionService } from '../server/src/services/folios/addConsumption';

export const handler: Handler = async (event: HandlerEvent, _context: HandlerContext) => {
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Method Not Allowed' }),
    };
  }

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

  try {
    const result = await addConsumptionService(payload, authContext);
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(result),
    };
  } catch (error: any) {
    if (error instanceof ConsumptionError) {
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
