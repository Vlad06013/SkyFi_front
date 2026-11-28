import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';

/**
 * Соц-уведомления (баг 26): заявки в друзья, шары, добавки в очередь.
 * На экране — тост (шлют хендлеры) + короткий сигнал; в фоне — системное
 * уведомление со звуком канала: foreground-service медиасессии держит
 * процесс и сокет, события доезжают без FCM. В браузере — только сигнал.
 */

const CHANNEL_ID = 'skyfi-social';
let permissionAsked = false;
let idSeq = 0;

/**
 * id обязан быть уникальным МЕЖДУ запусками процесса: счётчик с нуля
 * повторял id ещё висящего в шторке уведомления, и Android молча заменял
 * его без звука и баннера — «пришло ровно один раз». Отметка времени
 * (в пределах Int32) + короткий счётчик на случай двух событий в одну
 * миллисекунду.
 */
function freshNotificationId(): number {
  idSeq = (idSeq + 1) % 100;
  return (Date.now() + idSeq) % 2_147_483_000;
}

/** Разовая настройка на нативе: канал со звуком + запрос разрешения (Android 13+). */
export function initSocialNotifications(): void {
  if (!Capacitor.isNativePlatform()) return;
  void (async () => {
    try {
      const permission = await LocalNotifications.checkPermissions();
      if (permission.display === 'prompt' && !permissionAsked) {
        permissionAsked = true;
        await LocalNotifications.requestPermissions();
      }
      await LocalNotifications.createChannel({
        id: CHANNEL_ID,
        name: 'Уведомления SkyFi',
        description: 'Заявки в друзья, поделились треком, очередь',
        importance: 4,
        vibration: true,
      });
    } catch {
      /* без разрешения остаются тосты и сигнал */
    }
  })();
}

/** Приложение не на экране: тост никто не увидит — нужно системное уведомление. */
function inBackground(): boolean {
  return typeof document !== 'undefined' && document.visibilityState === 'hidden';
}

/** Событие соц-слоя: в фоне — системное уведомление, на экране — сигнал поверх тоста. */
export function notifySocial(title: string, body: string): void {
  if (Capacitor.isNativePlatform() && inBackground()) {
    void LocalNotifications.schedule({
      notifications: [{ id: freshNotificationId(), title, body, channelId: CHANNEL_ID }],
    }).catch(() => undefined);
    return;
  }
  playNotifySound();
}

let audioCtx: AudioContext | null = null;

/** Короткий двухтональный сигнал без ассета (WebAudio). Best-effort: до первого жеста контекст может быть заблокирован. */
function playNotifySound(): void {
  try {
    audioCtx ??= new AudioContext();
    if (audioCtx.state === 'suspended') void audioCtx.resume();
    const ctx = audioCtx;
    const start = ctx.currentTime;
    const tones: Array<[number, number]> = [
      [0, 880],
      [0.12, 1174.66],
    ];
    for (const [offset, frequency] of tones) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, start + offset);
      gain.gain.exponentialRampToValueAtTime(0.2, start + offset + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + offset + 0.35);
      osc.connect(gain).connect(ctx.destination);
      osc.start(start + offset);
      osc.stop(start + offset + 0.4);
    }
  } catch {
    /* звук уведомления — не критично */
  }
}
