<template>
  <!-- Верхняя панель: профиль слева, поиск справа.
       На всех страницах приложения. Контейнер пропускает
       клики сквозь себя — кликабельны только кнопки. -->
  <div class="app-top-bar">
    <RouterLink
        to="/profile"
        class="top-bar-button top-bar-profile"
        :aria-label="`Профиль: ${userName}`"
    >
      {{ userInitial }}
    </RouterLink>

    <RouterLink
        to="/search"
        class="top-bar-button top-bar-search"
        aria-label="Поиск"
    >
      <ion-icon :icon="searchOutline" />
    </RouterLink>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { RouterLink } from 'vue-router';
import { IonIcon } from '@ionic/vue';
import { searchOutline } from 'ionicons/icons';
import { useAuthStore } from '@/stores/auth';

const auth = useAuthStore();

const userName = computed(() => auth.user?.name ?? 'Профиль');

const userInitial = computed(
    () => auth.user?.name?.trim().charAt(0).toUpperCase() || 'U',
);
</script>

<style scoped>
.app-top-bar {
  position: fixed;
  top: calc(10px + var(--app-safe-top, 0px));
  left: 0;
  right: 0;

  /* Ниже модалок страниц (z-index 20+), выше контента. */
  z-index: 15;

  display: flex;
  align-items: center;
  justify-content: space-between;

  padding: 0 18px;

  box-sizing: border-box;

  pointer-events: none;
}

.top-bar-button {
  display: grid;
  place-items: center;

  width: 44px;
  height: 44px;

  border: 1px solid #c0adff55;
  border-radius: 50%;

  background: #0b0d12d9;
  color: #d5c9ff;

  text-decoration: none;

  pointer-events: auto;

  cursor: pointer;

  transition:
      background 0.2s,
      border-color 0.2s,
      color 0.2s;
}

.top-bar-button:hover {
  background: #171a23;
  border-color: #c0adffaa;
}

.top-bar-profile {
  font-size: 15px;
  font-weight: 700;
}

.top-bar-search {
  font-size: 21px;
}

.top-bar-search.router-link-active {
  border-color: #8b5cf6;
  background: rgba(139, 92, 246, 0.25);
  color: #c4b5fd;
}

.top-bar-button:focus-visible {
  outline: 3px solid #c4b5fd;
  outline-offset: 3px;
}
</style>
