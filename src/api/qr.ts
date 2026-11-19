import { http } from '@/api/http';
import type { QrConfirmPayload, QrStartPayload, QrStatusPayload } from '@/types';

export function startQrLogin() {
  return http.post<QrStartPayload>('qr-login');
}

export function fetchQrStatus(code: string) {
  return http.get<QrStatusPayload>(`qr-login/${encodeURIComponent(code)}`);
}

export function confirmQrLogin(code: string) {
  return http.post<QrConfirmPayload>('qr-login/confirm', { code });
}
