import { ref } from 'vue';

/**
 * Тап по системному уведомлению «добавил в очередь».
 * Плеер открывает слой очереди, когда текущий трек уже есть
 * (развёртка без current не рисуется).
 */
export const queueReveal = ref(0);

let applied = 0;

export function revealQueue(): void {
  queueReveal.value += 1;
}

export function queueRevealPending(): boolean {
  return queueReveal.value !== applied;
}

export function ackQueueReveal(): void {
  applied = queueReveal.value;
}
