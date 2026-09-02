import { api, getToken, setToken } from './api';

export interface MeUser {
  id: string;
  name: string;
  email: string;
  role: string;
  salespersonId: string | null;
}

export async function fetchMe(): Promise<MeUser | null> {
  if (!getToken()) return null;
  try {
    const { user } = await api<{ user: MeUser }>('/auth/me');
    return user;
  } catch {
    setToken(null);
    return null;
  }
}

export async function login(email: string, password: string): Promise<MeUser> {
  const { accessToken, user } = await api<{ accessToken: string; user: MeUser }>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  setToken(accessToken);
  return user;
}

export function logout(): void {
  setToken(null);
}