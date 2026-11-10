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
import { IonApp, IonRouterOutlet } from '@ionic/vue';
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

onMounted(() => {
  initHardwareBackButton();
  appLayout.start();

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
