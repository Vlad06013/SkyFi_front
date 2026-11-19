<template>
  <ion-app>
    <router-view />
    <app-splash v-if="app.phase !== 'ready'" />
  </ion-app>
</template>

<script src="./App.ts" lang="ts"></script>
