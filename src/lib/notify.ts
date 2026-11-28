import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import type { Router } from 'vue-router';
import { openSnapshot } from '@/lib/open-snapshot';
import { revealQueue } from '@/lib/player-reveal';
import { useNotificationsStore } from '@/stores/notifications';
import { usePlayerStore } from '@/stores/player';
import type { AnySnapshot } from '@/types';

/**
 * Соц-уведомления (баг 26): заявки в друзья, шары, добавки в очередь.
 * На экране — тост (шлют хендлеры) + короткий сигнал; в фоне — системное
 * уведомление со звуком канала: foreground-service медиасессии держит
 * процесс и сокет, события доезжают без FCM. В браузере — только сигнал.
 */

const CHANNEL_ID = 'skyfi-social';
const ICON = 'ic_stat_skyfi';
const ICON_COLOR = '#1ED760';
let permissionAsked = false;
let idSeq = 0;
let listening = false;

/** Куда вести тап по системному уведомлению. */
export type SocialTarget =
  | { to: 'friends' }
  | { to: 'queue' }
  | { to: 'share'; shareId: number; snapshot: AnySnapshot };

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
export function initSocialNotifications(router: Router): void {
  if (!Capacitor.isNativePlatform()) return;
  listenForTaps(router);
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
export function notifySocial(title: string, body: string, target: SocialTarget): void {
  if (Capacitor.isNativePlatform() && inBackground()) {
    void LocalNotifications.schedule({
      notifications: [{
        id: freshNotificationId(),
        title,
        body,
        channelId: CHANNEL_ID,
        smallIcon: ICON,
        iconColor: ICON_COLOR,
        extra: target,
      }],
    }).catch(() => undefined);
    return;
  }
  playNotifySound();
}

function readTarget(extra: unknown): SocialTarget | null {
  if (!extra || typeof extra !== 'object') return null;
  const to = (extra as { to?: unknown }).to;
  if (to === 'friends' || to === 'queue') return { to };
  if (to !== 'share') return null;
  const shareId = (extra as { shareId?: unknown }).shareId;
  const snapshot = (extra as { snapshot?: AnySnapshot }).snapshot;
  if (typeof shareId !== 'number' || !snapshot || typeof snapshot !== 'object' || !snapshot.type) return null;
  return { to: 'share', shareId, snapshot };
}

function go(router: Router, path: string): void {
  if (router.currentRoute.value.fullPath === path) return;
  void router.push(path);
}

/** Тап по уведомлению: друзья, объект шары или очередь плеера. */
export function openSocialTarget(router: Router, target: SocialTarget): void {
  if (target.to === 'friends') {
    go(router, '/friends');
    return;
  }
  if (target.to === 'queue') {
    revealQueue();
    if (!usePlayerStore().current) go(router, '/home');
    return;
  }
  useNotificationsStore().markRead(target.shareId);
  openSnapshot(router, target.snapshot);
}

function listenForTaps(router: Router): void {
  if (listening) return;
  listening = true;
  void LocalNotifications.addListener('localNotificationActionPerformed', (action) => {
    if (action.actionId && action.actionId !== 'tap') return;
    const target = readTarget(action.notification.extra);
    if (!target) return;
    void router.isReady().then(() => openSocialTarget(router, target));
  });
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
