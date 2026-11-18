<template>
  <div class="sky-shell" :class="{ 'is-wave': isHome }">
    <div class="sky-body">
      <router-view />
    </div>
    <div class="sky-dock">
      <MiniPlayer v-if="!isHome" />
      <TabBar />
    </div>
    <NotificationPanel />
    <NowPlaying />
    <AppToast />
  </div>
</template>

<script src="./TabsLayout.ts" lang="ts"></script>
