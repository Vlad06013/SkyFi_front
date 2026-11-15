<template>
  <button
      type="button"
      class="download-circle"
      :class="{
        'download-circle-active': active,
        'download-circle-done': done,
      }"
      :title="title"
      :aria-label="title"
      @click="$emit('click')"
  >
    <svg
        class="download-circle-ring"
        viewBox="0 0 44 44"
        aria-hidden="true"
    >
      <circle
          class="ring-bg"
          cx="22"
          cy="22"
          r="19"
      />
      <circle
          class="ring-fill"
          cx="22"
          cy="22"
          r="19"
          :stroke-dasharray="CIRCUMFERENCE"
          :stroke-dashoffset="ringOffset"
      />
    </svg>

    <ion-icon
        v-if="!active"
        :icon="done ? checkmark : arrowDown"
    />
    <span v-else class="download-circle-pct">{{ percent }}%</span>
  </button>
</template>

<script setup lang="ts">
import {computed} from 'vue';
import {IonIcon} from '@ionic/vue';
import {arrowDownOutline, checkmark} from 'ionicons/icons';

/**
 * Круглая кнопка «Скачать все» (как в Яндекс Музыке):
 * стрелка вниз; при скачивании вокруг окружности заливается
 * кольцо прогресса, внутри — проценты; по завершении —
 * зелёная галка.
 */
const props = defineProps<{
  /** Общий процент (0..100). */
  percent: number;
  /** Идёт скачивание. */
  active: boolean;
  /** Всё скачано. */
  done: boolean;
}>();

defineEmits<{
  (event: 'click'): void;
}>();

const CIRCUMFERENCE = 2 * Math.PI * 19;

const ringOffset = computed(
    () =>
        CIRCUMFERENCE
        * (1 - Math.min(100, Math.max(0, props.percent)) / 100),
);

const arrowDown = arrowDownOutline;

const title = computed(() => {
  if (props.active) {
      return `Скачивается: ${props.percent}% — нажмите, чтобы остановить`;
  }

  if (props.done) return 'Всё избранное скачано для офлайна';

  return 'Скачать всё избранное для офлайна';
});
</script>

<style scoped>
.download-circle {
    position: relative;

    display: grid;
    place-items: center;

    width: 44px;
    height: 44px;

    padding: 0;

    border: 0;
    border-radius: 50%;

    background: #171a23;
    color: #d5c9ff;

    cursor: pointer;

    transition:
        background 0.2s,
        color 0.2s;
}

.download-circle:hover {
    background: #232738;
}

.download-circle:focus-visible {
    outline: 2px solid #c4b5fd;
    outline-offset: 3px;
}

.download-circle ion-icon {
    font-size: 19px;
}

/* Кольцо прогресса по окружности. */
.download-circle-ring {
    position: absolute;
    inset: 0;

    width: 100%;
    height: 100%;

    transform: rotate(-90deg);
}

.download-circle-ring circle {
    fill: none;

    stroke-width: 3;
}

.ring-bg {
    stroke: #2c3040;
}

.ring-fill {
    stroke: #8b5cf6;
    stroke-linecap: round;

    transition: stroke-dashoffset 0.25s linear;
}

/* Внутри — проценты вместо стрелки. */
.download-circle-pct {
    font-size: 9px;
    font-weight: 700;
    color: #f5f7fa;
}

/* Всё скачано. */
.download-circle-done {
    color: #4ade80;
}

.download-circle-done .ring-fill {
    stroke: #4ade80;
}
</style>
