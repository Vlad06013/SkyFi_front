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

<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import AppToast from '@/components/AppToast/AppToast.vue';
import MiniPlayer from '@/components/MiniPlayer/MiniPlayer.vue';
import TabBar from '@/components/TabBar/TabBar.vue';
import NotificationPanel from '@/components/NotificationPanel/NotificationPanel.vue';
import NowPlaying from '@/components/NowPlaying/NowPlaying.vue';

const route = useRoute();
const isHome = computed(() => route.path === '/home');
</script>
