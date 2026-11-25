import { computed, defineComponent, onBeforeUnmount, ref, watch } from 'vue';
import { storeToRefs } from 'pinia';
import { useToastStore } from '@/stores/toast';

const DISMISS_PX = 72;

/** Горизонтальный сдвиг больше вертикального и порога — тост уезжает. */
export function toastSwipe(dx: number, dy: number): 'dismiss' | 'stay' {
  if (Math.abs(dx) >= DISMISS_PX && Math.abs(dx) > Math.abs(dy)) return 'dismiss';
  return 'stay';
}

export default defineComponent({
  name: 'AppToast',
  setup() {
    const toastStore = useToastStore();
    const { toast } = storeToRefs(toastStore);
    const x = ref(0);
    const dragging = ref(false);
    let generation = 0;
    let stopPointer: (() => void) | null = null;

    const faceStyle = computed(() => {
      if (!dragging.value && x.value === 0) return undefined;
      const opacity = Math.max(0, 1 - Math.abs(x.value) / 280);
      return {
        transform: `translateX(${x.value}px)`,
        opacity: String(opacity),
        transition: dragging.value ? 'none' : 'transform .18s ease, opacity .18s ease',
      };
    });

    function reset() {
      generation += 1;
      dragging.value = false;
      x.value = 0;
      stopPointer?.();
      stopPointer = null;
    }

    watch(toast, reset);

    function flyOff(dx: number) {
      const mine = generation;
      dragging.value = false;
      x.value = (dx >= 0 ? 1 : -1) * Math.max(window.innerWidth, 480);
      window.setTimeout(() => {
        if (mine !== generation) return;
        toastStore.hide();
        x.value = 0;
      }, 180);
    }

    function onPointerDown(event: PointerEvent) {
      if (event.button !== 0) return;
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest('button')) return;

      const startX = event.clientX;
      const startY = event.clientY;
      const pointerId = event.pointerId;
      let claimed = false;

      const move = (next: PointerEvent) => {
        if (next.pointerId !== pointerId) return;
        const dx = next.clientX - startX;
        const dy = next.clientY - startY;
        if (!claimed) {
          if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
          if (Math.abs(dy) > Math.abs(dx)) {
            cleanup();
            return;
          }
          claimed = true;
          dragging.value = true;
        }
        if (next.cancelable) next.preventDefault();
        x.value = dx;
      };

      const up = (next: PointerEvent) => {
        if (next.pointerId !== pointerId) return;
        cleanup();
        const dx = next.clientX - startX;
        const dy = next.clientY - startY;
        dragging.value = false;
        if (toastSwipe(dx, dy) === 'dismiss') {
          flyOff(dx);
          return;
        }
        x.value = 0;
      };

      const cancel = (next: PointerEvent) => {
        if (next.pointerId !== pointerId) return;
        cleanup();
        dragging.value = false;
        x.value = 0;
      };

      function cleanup() {
        window.removeEventListener('pointermove', move, true);
        window.removeEventListener('pointerup', up, true);
        window.removeEventListener('pointercancel', cancel, true);
        if (stopPointer === cleanup) stopPointer = null;
      }

      stopPointer = cleanup;
      window.addEventListener('pointermove', move, { capture: true, passive: false });
      window.addEventListener('pointerup', up, { capture: true });
      window.addEventListener('pointercancel', cancel, { capture: true });
    }

    onBeforeUnmount(() => stopPointer?.());

    return { toast, faceStyle, onPointerDown, runAction: toastStore.runAction };
  },
});
