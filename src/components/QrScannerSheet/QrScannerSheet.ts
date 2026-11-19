import { defineComponent, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { Html5Qrcode } from 'html5-qrcode';
import AppSheet from '@/components/AppSheet/AppSheet.vue';

function extractCode(text: string): string {
  // QR ведёт на <origin>/qr-confirm?code=… — берём код из ссылки;
  // если в коде сырой текст — используем как есть.
  try {
    const url = new URL(text);
    return url.searchParams.get('code') ?? text;
  } catch {
    return text;
  }
}

export default defineComponent({
  name: 'QrScannerSheet',
  components: { AppSheet },
  props: {
    open: { type: Boolean, required: true },
  },
  emits: ['close', 'scanned'],
  setup(props, { emit }) {
    const error = ref('');
    let scanner: Html5Qrcode | null = null;
    let settled = false;

    async function stop() {
      if (!scanner) return;
      try {
        if (scanner.isScanning) await scanner.stop();
        scanner.clear();
      } catch {
        // Уже остановлен — просто чистим.
      }
      scanner = null;
    }

    async function start() {
      settled = false;
      error.value = '';
      // Шит рендерится v-if в телепорте — ждём появления контейнера.
      await nextTick();
      const element = document.getElementById('qr-reader');
      if (!element) return;

      // Камера доступна только в secure context (https или localhost).
      // По http://192.168.x.x mediaDevices отсутствует, и браузер даже не
      // показывает запрос разрешения — падаем с понятной ошибкой сразу.
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
        error.value = 'Камера доступна только по защищённому соединению (HTTPS). Откройте приложение по https-адресу или через приложение SkyFi.';
        return;
      }

      scanner = new Html5Qrcode(element.id);
      try {
        await scanner.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: { width: 200, height: 200 } },
          async (text) => {
            if (settled) return;
            settled = true;
            await stop();
            emit('scanned', extractCode(text));
          },
          () => {
            // Кадр без QR — штатный ход сканера, игнорируем.
          },
        );
      } catch {
        await stop();
        error.value = await cameraErrorMessage();
      }
    }

    async function cameraErrorMessage(): Promise<string> {
      // Отказ в настройках сайта — браузер не покажет запрос повторно,
      // пока доступ не включить вручную.
      try {
        const status = await navigator.permissions?.query({ name: 'camera' as PermissionName });
        if (status?.state === 'denied') {
          return 'Доступ к камере заблокирован в настройках сайта. Включите его (значок замка в адресной строке) и нажмите «Повторить».';
        }
      } catch {
        // Permissions API недоступен (WebView) — оставляем общее сообщение.
      }
      return 'Не удалось открыть камеру. Разрешите доступ и попробуйте снова.';
    }

    watch(
      () => props.open,
      (isOpen) => {
        if (isOpen) void start();
        else void stop();
      },
    );

    onBeforeUnmount(() => {
      void stop();
    });

    return { error, retry: start };
  },
});
