import { request } from './client';

/** The logged-in user's own account, as GET /me returns it. */
export type User = {
  id: string;
  email: string;
  username: string;
  bio: string;
  avatarUrl: string | null;
  favoriteGenres: string[];
  /** When first-run setup (importing a playlist) was finished; null until then. */
  onboardedAt: string | null;
  createdAt: string;
};

export type AuthResponse = { token: string; user: User };

export function signup(email: string, username: string, password: string) {
  return request<AuthResponse>('/auth/signup', {
    method: 'POST',
    body: JSON.stringify({ email, username, password }),
  });
}

/** `identifier` is an email or a username. */
export function login(identifier: string, password: string) {
  return request<AuthResponse>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ identifier, password }),
  });
}

export function getMe() {
  return request<User>('/me');
}

/** Edits what other people see on your profile. */
export function updateProfile(changes: { bio?: string; avatarUrl?: string | null }) {
  return request<User>('/me', {
    method: 'PATCH',
    body: JSON.stringify(changes),
  });
}

/** Marks first-run setup done. Safe to repeat. */
export function completeOnboarding() {
  return request<User>('/me/onboarded', { method: 'POST' });
}

export function deleteAccount(password: string) {
  return request<{ deleted: true }>('/me', { method: 'DELETE', body: JSON.stringify({ password }) });
}
