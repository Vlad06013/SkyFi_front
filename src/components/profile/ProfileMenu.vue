<template>
  <!-- Меню пользователя -->
  <div
      class="profile-menu"
      :class="{ 'profile-menu--floating': floating }"
  >
    <button
        class="profile-button"
        aria-label="Открыть меню профиля"
        :aria-expanded="profileMenuOpen"
        aria-haspopup="true"
        :disabled="loggingOut"
        @click.stop="profileMenuOpen = !profileMenuOpen"
    >
      {{ auth.user?.name?.charAt(0).toUpperCase() ?? 'U' }}

      <span class="profile-chevron">⌄</span>
    </button>

    <div
        v-if="profileMenuOpen"
        class="profile-dropdown"
        role="menu"
    >
      <div class="profile-info">
        <div class="profile-name">
          {{ auth.user?.name ?? 'Пользователь' }}
        </div>

        <div class="profile-email">
          {{ auth.user?.email ?? '' }}
        </div>
      </div>

      <div class="dropdown-divider"></div>

      <button
          class="dropdown-item"
          role="menuitem"
          @click="openProfile"
      >
        <span>♙</span>
        Мой профиль
      </button>

      <button
          class="dropdown-item"
          role="menuitem"
          @click="openLibrary"
      >
        <span>♫</span>
        Моя музыка
      </button>

      <div class="dropdown-divider"></div>

      <div v-if="logoutError" class="logout-error">
        {{ logoutError }}
      </div>

      <button
          class="dropdown-item logout-item"
          role="menuitem"
          :disabled="loggingOut"
          @click="logout"
      >
        <span>↪</span>

        {{
          loggingOut
              ? 'Выходим...'
              : 'Выйти из аккаунта'
        }}
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';

import { useAuthStore } from '@/stores/auth';

/*
 * floating закрепляет меню в правом верхнем углу экрана
 * для страниц без верхней панели.
 */

defineProps<{ floating?: boolean }>();

const router = useRouter();
const auth = useAuthStore();

const profileMenuOpen = ref(false);

const loggingOut = ref(false);

const logoutError = ref('');

function openProfile(): void {
  profileMenuOpen.value = false;

  logoutError.value = '';

  void router.push('/profile');
}

function openLibrary(): void {
  profileMenuOpen.value = false;

  logoutError.value = '';

  void router.push('/favorite');
}

async function logout(): Promise<void> {
  if (loggingOut.value) {
    return;
  }

  loggingOut.value = true;

  logoutError.value = '';

  try {
    await auth.logout();

    profileMenuOpen.value = false;

    await router.replace('/login');
  } catch (error) {
    console.error(
        'Ошибка выхода из аккаунта:',
        error,
    );

    logoutError.value =
        'Не удалось выйти. Попробуй ещё раз.';
  } finally {
    loggingOut.value = false;
  }
}

function handleDocumentClick(event: MouseEvent): void {
  const target = event.target;

  if (!(target instanceof Element)) {
    return;
  }

  if (!target.closest('.profile-menu')) {
    profileMenuOpen.value = false;
  }
}

function handleEscape(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    profileMenuOpen.value = false;
  }
}

onMounted(() => {
  document.addEventListener(
      'click',
      handleDocumentClick,
  );

  document.addEventListener(
      'keydown',
      handleEscape,
  );
});

onBeforeUnmount(() => {
  document.removeEventListener(
      'click',
      handleDocumentClick,
  );

  document.removeEventListener(
      'keydown',
      handleEscape,
  );
});
</script>

<style scoped>
/* =========================
   ПРОФИЛЬ
========================= */

.profile-menu {
    position: relative;
    margin-left: auto;
    flex-shrink: 0;
}

.profile-menu--floating {
    position: fixed;
    top: 22px;
    right: 4.5%;
    z-index: 900;
    margin-left: 0;
}

.profile-button {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 4px;

    width: 42px;
    height: 42px;

    margin-left: 0;
    padding: 0;

    border: 1px solid #c0adff55;
    border-radius: 50%;

    background: #a78bfa18;
    color: #d5c9ff;

    font-size: 15px;
    font-weight: 700;

    cursor: pointer;
    transition:
            background 0.2s,
            border-color 0.2s;
}

.profile-button:hover {
    background: #a78bfa30;
    border-color: #c0adffaa;
}

.profile-button:disabled {
    opacity: 0.6;
    cursor: wait;
}

.profile-chevron {
    font-size: 11px;
    opacity: 0.7;
}

.profile-dropdown {
    position: absolute;
    top: calc(100% + 12px);
    right: 0;

    width: 260px;
    max-width: calc(100vw - 24px);

    padding: 8px;

    border: 1px solid #ffffff12;
    border-radius: 14px;

    background: #171824;
    box-shadow: 0 15px 45px #0008;

    z-index: 100;
    animation: profile-dropdown-in 0.16s ease-out;
}

@keyframes profile-dropdown-in {
    from {
        opacity: 0;
        transform: translateY(-5px);
    }

    to {
        opacity: 1;
        transform: translateY(0);
    }
}

.profile-info {
    padding: 12px;
    min-width: 0;
}

.profile-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;

    color: #f5f3fa;
    font-size: 13px;
    font-weight: 700;
}

.profile-email {
    margin-top: 5px;

    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;

    color: #85899c;
    font-size: 11px;
}

.dropdown-divider {
    height: 1px;
    margin: 5px 0;
    background: #ffffff10;
}

.dropdown-item {
    display: flex;
    align-items: center;
    gap: 11px;

    width: 100%;
    padding: 11px 12px;

    border: 0;
    border-radius: 8px;

    background: transparent;
    color: #d8d6e5;

    font: inherit;
    font-size: 12px;
    text-align: left;

    cursor: pointer;
    transition:
            background 0.2s,
            color 0.2s;
}

.dropdown-item > span {
    width: 18px;
    text-align: center;
    font-size: 16px;
}

.dropdown-item:hover {
    background: #ffffff0a;
    color: #c6b5ff;
}

.dropdown-item:disabled {
    opacity: 0.6;
    cursor: wait;
}

.logout-item {
    color: #f09aab;
}

.logout-item:hover {
    background: #f05b7715;
    color: #ffb0bf;
}

.logout-error {
    padding: 8px 12px;
    color: #ff9ba9;
    font-size: 11px;
    line-height: 1.5;
}

/* =========================
   МОБИЛЬНЫЕ УСТРОЙСТВА
========================= */

@media (max-width: 650px) {
    .profile-menu {
        margin-left: 0;
    }

    .profile-menu--floating {
        top: 15px;
        right: 17px;
    }

    .profile-button {
        width: 35px;
        height: 35px;
        font-size: 13px;
    }

    .profile-chevron {
        display: none;
    }

    .profile-dropdown {
        top: calc(100% + 10px);
        right: 0;
        width: 260px;
    }
}
</style>
