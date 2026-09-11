import { auth } from '../firebase/config';

async function getAuthToken(): Promise<string> {
  const user = auth.currentUser;
  if (!user) {
    throw new Error('Usuario no autenticado');
  }
  return await user.getIdToken();
}

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    let errorMessage = `Error HTTP ${response.status}`;
    try {
      const errorData = await response.json();
      if (errorData && errorData.error) {
        errorMessage = errorData.error;
      } else if (errorData && errorData.message) {
        errorMessage = errorData.message;
      }
    } catch (e) {
      // Ignorar si no es JSON o está vacío
    }
    throw new Error(errorMessage);
  }
  return response.json();
}

export async function apiGet<T>(path: string): Promise<T> {
  const token = await getAuthToken();
  const response = await fetch(path, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });
  return handleResponse<T>(response);
}

export async function apiPost<T>(path: string, body?: unknown): Promise<T> {
  const token = await getAuthToken();
  const headers: HeadersInit = {
    'Authorization': `Bearer ${token}`
  };
  
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  const response = await fetch(path, {
    method: 'POST',
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined
  });
  return handleResponse<T>(response);
}
