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

    <ion-infinite-scroll
        v-if="items.length > 0"
        :disabled="!hasMore || loading || loadingMore || !!error"
        threshold="150px"
        @ionInfinite="handleInfinite"
    >
      <ion-infinite-scroll-content
          loading-spinner="crescent"
          loading-text="Загрузка..."
      />
    </ion-infinite-scroll>
  </div>
</template>

<script setup lang="ts" generic="T">
import {
  IonButton,
  IonInfiniteScroll,
  IonInfiniteScrollContent,
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

function getItemKey(item: T, index: number): string | number {
  return props.getKey?.(item, index) ?? index;
}

async function handleInfinite(event: CustomEvent): Promise<void> {
  try {
    if (
        props.hasMore &&
        props.loadMore &&
        !props.loading &&
        !props.loadingMore
    ) {
      await props.loadMore();
    }
  } finally {
    await (
        event.target as HTMLIonInfiniteScrollElement
    ).complete();
  }
}
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
</style>