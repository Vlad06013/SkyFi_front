<template>
  <div class="base-infinite-list">
    <div
        v-if="error && items.length === 0 && !loading"
        class="list-state list-error"
    >
      <p>Не удалось загрузить список.</p>
      <ion-button fill="outline" @click="retry">
        Повторить
      </ion-button>
    </div>

    <div
        v-else-if="items.length === 0 && !loading"
        class="list-state list-empty"
    >
      <slot name="empty">
        <p>Список пока пуст.</p>
      </slot>
    </div>

    <div v-else class="base-infinite-list__items">
      <slot
          v-for="(item, index) in items"
          :key="getItemKey(item, index)"
          name="item"
          :item="item"
          :index="index"
      />
    </div>

    <div
        v-if="loading && items.length === 0"
        class="list-state"
    >
      <ion-spinner name="crescent" />
      <p>Загрузка...</p>
    </div>

    <div v-else-if="loadingMore" class="list-state">
      <ion-spinner name="crescent" />
      <p>Загрузка...</p>
    </div>

    <div
        v-if="error && items.length > 0"
        class="list-state list-error"
    >
      <p>Не удалось загрузить следующие элементы.</p>
      <ion-button fill="outline" @click="retry">
        Повторить
      </ion-button>
    </div>

    <div
        v-if="!hasMore && !loading && !loadingMore && !error && items.length > 0"
        class="list-end"
    >
      <slot name="end">Больше элементов нет</slot>
    </div>

    <!-- Маркер конца списка: следующая страница подгружается,
         когда он входит в зону видимости (скролл до низа).
         Пока контент ниже вьюпорта (телевизоры, широкие экраны),
         страницы подтянутся подряд автоматически. -->
    <div
        ref="sentinelEl"
        class="list-sentinel"
        aria-hidden="true"
    />
  </div>
</template>

<script setup lang="ts" generic="T">
import {
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
} from 'vue';
import {
  IonButton,
  IonSpinner,
} from '@ionic/vue';

interface Props {
  items: T[];
  loading?: boolean;
  loadingMore?: boolean;
  hasMore: boolean;
  error?: unknown;
  getKey?: (item: T, index: number) => string | number;
  loadMore: () => Promise<void>;
  retry: () => Promise<void>;
}

const props = withDefaults(defineProps<Props>(), {
  loading: false,
  loadingMore: false,
});

const sentinelEl = ref<HTMLElement | null>(null);

let observer: IntersectionObserver | null = null;

/** Идёт ли сейчас цепочка подгрузки — повторные триггеры игнорим. */
let pumping = false;

/** Запас до нижнего края: страница догружается чуть раньше,
 *  чем маркер доедет до самого низа. */
const SENTINEL_MARGIN_PX = 200;

/** Максимум страниц за один заход — страховка от зависшего
 *  hasMore. 100 страниц × 20 элементов — с большим запасом
 *  выше реальной глубины списков. */
const MAX_PAGES_PER_PUMP = 100;

function getItemKey(item: T, index: number): string | number {
  return props.getKey?.(item, index) ?? index;
}

async function runLoadMore(): Promise<void> {
  if (
      props.hasMore &&
      props.loadMore &&
      !props.loading &&
      !props.loadingMore &&
      !props.error
  ) {
    await props.loadMore();
  }
}

/**
 * Маркер виден в зеркале отступов observer'а (viewport + запас
 * снизу). Пока контент ниже вьюпорта — виден всегда: страницы
 * подтягиваются подряд без скролла. Как только список стал
 * выше экрана — скрыт за нижним краем: дальше только скролл
 * пользователя.
 */
function sentinelVisible(): boolean {
  const el = sentinelEl.value;

  if (!el) {
    return false;
  }

  const rect = el.getBoundingClientRect();

  return (
      rect.top <= window.innerHeight + SENTINEL_MARGIN_PX &&
      rect.bottom >= -SENTINEL_MARGIN_PX
  );
}

/**
 * Подгружаем страницы, пока маркер виден. Один заход —
 * не больше одной «волны»: обычно это одна страница за скролл
 * до низа; на экранах, куда контент не влезает, — столько,
 * сколько нужно, чтобы список стал листаемым.
 */
async function pumpMore(): Promise<void> {
  if (pumping) {
    return;
  }

  pumping = true;

  try {
    let pages = 0;

    while (
        pages < MAX_PAGES_PER_PUMP &&
        props.hasMore &&
        !props.loading &&
        !props.loadingMore &&
        !props.error &&
        sentinelVisible()
    ) {
      await runLoadMore();
      pages += 1;

      // Даём списку перерендериться: маркер съезжает вниз.
      await nextTick();
    }
  } finally {
    pumping = false;
  }
}

function handleSentinel(
    entries: IntersectionObserverEntry[],
): void {
  for (const entry of entries) {
    if (entry.isIntersecting) {
      void pumpMore();

      return;
    }
  }
}

onMounted(() => {
  if (!sentinelEl.value) {
    return;
  }

  // root не указываем: observer сам учитывает обрезку
  // ближайшими прокручиваемыми контейнерами (ion-content).
  observer = new IntersectionObserver(handleSentinel, {
    rootMargin: `${SENTINEL_MARGIN_PX}px 0px`,
  });

  observer.observe(sentinelEl.value);
});

onBeforeUnmount(() => {
  observer?.disconnect();
  observer = null;
});

// После смены данных снова проверяем маркер: первая порция
// могла не заполнить экран, флаги загрузки снялись — догружаем.
watch(
    () => [
      props.loading,
      props.loadingMore,
      props.hasMore,
      props.error,
      props.items.length,
    ],
    () => {
      void nextTick().then(() => pumpMore());
    },
);
</script>

<style scoped>
.base-infinite-list {
  width: 100%;
}

.base-infinite-list__items {
  display: flex;
  flex-direction: column;
  width: 100%;
}

.list-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 32px 16px;
  text-align: center;
}

.list-state p {
  margin: 0;
}

.list-empty,
.list-end {
  color: var(--ion-color-medium);
}

.list-end {
  padding: 20px 16px;
  text-align: center;
  font-size: 0.875rem;
}

.list-error {
  color: var(--ion-color-danger);
}

/* Маркер конца списка для IntersectionObserver:
   не должен занимать места в раскладке. */
.list-sentinel {
  height: 1px;
}


</style>