<template>
  <div v-if="isOffline" class="offline-banner" role="status">
    <span class="status"><i class="dot off" />Офлайн-режим</span>
  </div>
</template>

<script src="./OfflineBanner.ts" lang="ts"></script>

<style scoped src="./OfflineBanner.css"></style>
