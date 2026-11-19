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
        error.value = 'Не удалось открыть камеру. Разрешите доступ и попробуйте снова.';
      }
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

    return { error };
  },
});
