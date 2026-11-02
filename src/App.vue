<template>
  <ion-app>
    <ion-router-outlet />

    <!-- Глобальный футер-плеер: монтируется один раз,
         переходы между страницами его не пересоздают. -->
    <AudioPlayer v-if="auth.isAuthenticated" />
  </ion-app>
</template>

<script setup lang="ts">
import { IonApp, IonRouterOutlet } from '@ionic/vue';
import AudioPlayer from '@/components/player/AudioPlayer.vue';
import { useAuthStore } from '@/stores/auth';

const auth = useAuthStore();
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
