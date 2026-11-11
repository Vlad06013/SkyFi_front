<template>
  <ion-app>
    <ion-router-outlet />

    <!-- Верхняя панель: профиль слева, поиск справа.
         На страницах входа/регистрации не нужна. -->
    <AppTopBar v-if="showTopBar" />

    <!-- Глобальный футер-плеер: монтируется один раз,
         переходы между страницами его не пересоздают.
         На странице волны сам бар скрывается (см. AudioPlayer),
         но компонент остаётся смонтированным: карточка трека
         открывается и с волны, и при возврате бар мгновенно
         показывает текущий трек. -->
    <AudioPlayer v-if="auth.isAuthenticated" />
  </ion-app>
</template>

<script setup lang="ts">
import { computed, onMounted, watch } from 'vue';
import { useRoute } from 'vue-router';
import { IonApp, IonRouterOutlet, toastController } from '@ionic/vue';
import AudioPlayer from '@/components/player/AudioPlayer.vue';
import AppTopBar from '@/components/AppTopBar.vue';
import { useAuthStore } from '@/stores/auth';
import { useNetworkStore } from '@/stores/network';
import { initHardwareBackButton } from '@/lib/hardwareBack';
import { useAppLayout } from '@/composables/useAppLayout';
import { useDownloadsStore } from '@/stores/downloads';

const auth = useAuthStore();
const appLayout = useAppLayout();
const route = useRoute();
const network = useNetworkStore();

const showTopBar = computed(
    () =>
        auth.isAuthenticated
        && route.path !== '/login'
        && route.path !== '/register',
);

// Отступ контента под верхнюю панель (см. variables.css).
watch(showTopBar, (show) => {
  document.body.classList.toggle('app--top-bar', show);
}, { immediate: true });

// ============================================
// ОФЛАЙН-УВЕДОМЛЕНИЕ
//
// Единый офлайн-сценарий — network store. Уход в офлайн
// (или вход уже в офлайне) — уведомление сверху: режим виден
// сразу, без охоты по интерфейсу.
// ============================================

let modeToastVisible = false;

/** Один тост режима сети за раз (offline/online). */
async function notifyNetworkMode(message: string): Promise<void> {
    if (modeToastVisible) return;

    modeToastVisible = true;

    const toast = await toastController.create({
        message,
        duration: 4000,
        position: 'top',
        cssClass: 'player-toast',
    });

    void toast.onDidDismiss().then(() => {
        modeToastVisible = false;
    });

    await toast.present();
}

watch(
    () => network.isOnline,
    (online) => {
        // Офлайн и восстановление сети сообщаем одинаково:
        // пользователь всегда знает, в каком режиме плеер.
        void notifyNetworkMode(
            online
                ? 'Сеть восстановлена.'
                : 'Нет сети — офлайн-режим. Играем скачанное.',
        );
    },
);

onMounted(() => {
  initHardwareBackButton();
  appLayout.start();

  // Вошли уже в офлайне — уведомляем сразу.
  if (!network.isOnline) {
      void notifyNetworkMode(
          'Нет сети — офлайн-режим. Играем скачанное.',
      );
  }

  // Офлайн-режим: затемнение несохранённых треков и пр.
  useNetworkStore().bind();

  // Маркеры скачанных треков в списках — из локальной базы.
  void useDownloadsStore().initialize();
});
</script>

<style>
/* Тосты уведомлений (рендерятся вне scoped-области). */
.friends-toast,
.player-toast {
  --background: #1d1b29;
  --color: #f4f4fa;
  --border-radius: 12px;
  --box-shadow: 0 12px 34px rgba(0, 0, 0, 0.45);
  font-size: 13px;
}
</style>
