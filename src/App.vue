<template>
  <ion-app>
    <router-view />
    <app-splash v-if="app.phase !== 'ready'" />
    <app-toast />
    <AppConfirm
      :open="updatePromptOpen"
      :title="updateTitle"
      :message="updateMessage"
      confirm-label="Обновить"
      cancel-label="Позже"
      :danger="false"
      :locked="updateMandatory"
      :confirm-disabled="updateDownloading"
      @confirm="applyUpdate"
      @close="dismissUpdate"
    />
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
