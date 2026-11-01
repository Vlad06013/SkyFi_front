<template>
  <ion-app>
    <ion-router-outlet />
  </ion-app>
</template>

<script setup lang="ts">
import { IonApp, IonRouterOutlet } from '@ionic/vue';
</script>

<style>
/* Тосты уведомлений о заявках в друзья (рендерятся вне scoped-области). */
.friends-toast {
  --background: #1d1b29;
  --color: #f4f4fa;
  --border-radius: 12px;
  --box-shadow: 0 12px 34px rgba(0, 0, 0, 0.45);
  font-size: 13px;
}
</style>
