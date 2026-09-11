import { apiGet } from './apiClient';

export interface BackendUserResponse {
  authenticated: boolean;
  uid: string;
  email?: string;
  roles?: Record<string, string>;
}

export async function getCurrentBackendUser(): Promise<BackendUserResponse> {
  return await apiGet<BackendUserResponse>('/api/me');
}
