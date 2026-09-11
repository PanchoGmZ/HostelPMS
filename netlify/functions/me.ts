import type { Handler, HandlerEvent, HandlerContext } from '@netlify/functions';
import { verifyAuth } from '../server/src/auth/verifyAuth';

export const handler: Handler = async (event: HandlerEvent, context: HandlerContext) => {
  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method Not Allowed' }),
    };
  }

  try {
    const authContext = await verifyAuth(event);

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        authenticated: true,
        uid: authContext.uid,
        email: authContext.email,
        roles: authContext.roles
      }),
    };
  } catch (error: any) {
    return {
      statusCode: 401,
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ 
        authenticated: false, 
        error: error.message 
      }),
    };
  }
};
