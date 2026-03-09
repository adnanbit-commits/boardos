// src/lib/auth.ts
// Thin helpers around localStorage for JWT + user storage.
// In a production app you'd use httpOnly cookies + a /me endpoint,
// but this keeps the MVP simple and self-contained.

import { User } from './api';

const TOKEN_KEY = 'boardos_token';
const USER_KEY  = 'boardos_user';

export function saveSession(token: string, user: User) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function getUser(): User | null {
  if (typeof window === 'undefined') return null;
  const raw = localStorage.getItem(USER_KEY);
  return raw ? JSON.parse(raw) : null;
}

export function clearSession() {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

export function isAuthenticated(): boolean {
  return !!getToken();
}
