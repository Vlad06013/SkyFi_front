<template>
  <ion-app>
    <router-view />
    <app-splash v-if="app.phase !== 'ready'" />
    <app-toast />
    <AppConfirm
      :open="exitPromptOpen"
      title="Закрыть приложение?"
      message="Выйти из SkyFi?"
      confirm-label="Закрыть"
      cancel-label="Остаться"
      @confirm="confirmExit"
      @close="exitPromptOpen = false"
    />
  </ion-app>
</template>

<script src="./App.ts" lang="ts"></script>
