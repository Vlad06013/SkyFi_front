<template>
  <div class="sky-shell" :class="{ 'is-wave': isHome }">
    <div class="sky-body">
      <router-view v-slot="{ Component }">
        <keep-alive>
          <component :is="Component" />
        </keep-alive>
      </router-view>
    </div>
    <div class="sky-dock">
      <MiniPlayer v-if="!isHome" />
      <TabBar />
    </div>
    <NotificationPanel />
    <NowPlaying />
  </div>
</template>

<script src="./TabsLayout.ts" lang="ts"></script>
