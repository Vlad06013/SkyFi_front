import { http } from '@/api/http';
import type { AuthPayload, AuthUser } from '@/types';

export interface RegisterBody {
  name: string;
  email: string;
  password: string;
  password_confirmation: string;
}

export interface ResetPasswordBody {
  email: string;
  code: string;
  password: string;
  password_confirmation: string;
}

/** Формы ответов проверены curl'ом против dev-бэка. */

export function login(email: string, password: string) {
  return http.post<AuthPayload>('login', { email, password });
}

export function register(body: RegisterBody) {
  return http.post<AuthPayload>('register', body);
}

export function fetchUser() {
  return http.get<AuthUser>('user');
}

export function logout() {
  return http.post<{ message: string }>('logout');
}

export function forgotPassword(email: string) {
  return http.post<{ message: string }>('forgot-password', { email });
}

export function resetPassword(body: ResetPasswordBody) {
  return http.post<{ message: string }>('reset-password', body);
}

export function updateProfile(name: string) {
  return http.patch<AuthUser>('profile', { name });
}

export function uploadAvatar(file: File) {
  const form = new FormData();
  form.append('avatar', file);
  return http.put<AuthUser>('profile/avatar', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
}

export function deleteAvatar() {
  return http.delete<AuthUser>('profile/avatar');
}
