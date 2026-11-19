import { onBeforeUnmount, ref } from 'vue';
import type { AuthPayload } from '@/types';
import { ApiError } from '@/api/http';
import * as qrApi from '@/api/qr';

export type QrLoginPhase = 'starting' | 'polling' | 'confirmed' | 'expired';

const POLL_INTERVAL_MS = 2_000;

/**
 * QR-вход с ТВ: старт → рендер qr_svg → поллинг статуса раз в 2 с.
 * confirmed → payload для auth.applyQrSession; 404 или локальный
 * дедлайн expires_at → expired («Обновить QR»).
 */
export function useQrLogin() {
  const qrSvg = ref('');
  const phase = ref<QrLoginPhase>('starting');
  const payload = ref<AuthPayload | null>(null);

  let code = '';
  let pollTimer: ReturnType<typeof setInterval> | null = null;
  let expiryTimer: ReturnType<typeof setTimeout> | null = null;

  function stopTimers() {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
    if (expiryTimer) {
      clearTimeout(expiryTimer);
      expiryTimer = null;
    }
  }

  async function poll() {
    try {
      const status = await qrApi.fetchQrStatus(code);
      if (status.status === 'confirmed' && status.token && status.user) {
        stopTimers();
        payload.value = { token: status.token, user: status.user };
        phase.value = 'confirmed';
      }
      // pending — молча крутимся до следующего тика.
    } catch (error) {
      // Код истёк или подтверждён чужим аккаунтом: бэк отдаёт 404.
      if (error instanceof ApiError && error.status === 404) {
        stopTimers();
        phase.value = 'expired';
      }
      // Сеть/5xx — следующий тик поллинга сам разберётся.
    }
  }

  async function start() {
    stopTimers();
    phase.value = 'starting';
    qrSvg.value = '';
    payload.value = null;
    try {
      const data = await qrApi.startQrLogin();
      code = data.code;
      qrSvg.value = data.qr_svg;
      phase.value = 'polling';
      void poll();
      pollTimer = setInterval(() => void poll(), POLL_INTERVAL_MS);
      const ttl = Date.parse(data.expires_at) - Date.now();
      if (ttl > 0) {
        expiryTimer = setTimeout(() => {
          stopTimers();
          phase.value = 'expired';
        }, ttl);
      }
    } catch {
      phase.value = 'expired';
    }
  }

  onBeforeUnmount(stopTimers);

  return { qrSvg, phase, payload, start, stop: stopTimers };
}
