<template>
  <div class="sky-shell" :class="{ 'is-wave': isHome }">
    <div ref="bodyEl" class="sky-body" @touchstart.passive="onPullStart" @touchend="onPullEnd" @touchcancel="onPullEnd">
      <div class="pull-refresh" :class="{ 'is-ready': pullReady, 'is-busy': refreshing }" :style="{ height: pull + 'px' }">
        <span class="pull-refresh-mark" aria-hidden="true">
          <svg v-if="refreshing" class="spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
            <circle cx="12" cy="12" r="8" opacity=".25" />
            <path d="M12 4a8 8 0 0 1 8 8" stroke-linecap="round" />
          </svg>
          <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 5v12" />
            <path d="m7 12 5 5 5-5" />
          </svg>
        </span>
        <span v-if="pull > 28 || refreshing" class="pull-refresh-label">{{ pullLabel }}</span>
      </div>
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
