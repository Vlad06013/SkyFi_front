<template>
  <ion-app>
    <router-view />
    <app-splash v-if="app.phase !== 'ready'" />
    <app-toast />
  </ion-app>
</template>

<script src="./App.ts" lang="ts"></script>
