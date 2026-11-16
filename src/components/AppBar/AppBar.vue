<template>
  <div class="appbar">
    <button v-if="back" class="icon-btn ghost" type="button" aria-label="назад" @click="goBack">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <path d="M14.5 6 8 12.5 14.5 19" />
      </svg>
    </button>
    <div v-else class="logo">{{ title }}</div>
    <span v-if="back" style="width:36px" />
    <button class="icon-btn ghost n-bell" type="button" aria-label="уведомления" @click.stop="toggle">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <path d="M6.5 9.5a5.5 5.5 0 1 1 11 0c0 5.5 2.5 6.5 2.5 8H4c0-1.5 2.5-2.5 2.5-8z" />
        <path d="M10 20a2 2 0 0 0 4 0" />
      </svg>
      <i v-if="hasUnread" class="badge-dot" />
    </button>
  </div>
</template>

<script setup lang="ts">
import { storeToRefs } from 'pinia';
import { useRouter } from 'vue-router';
import { useNotificationsStore } from '@/stores/notifications';

defineProps<{
  title?: string;
  back?: boolean;
  badge?: boolean;
}>();

const notifications = useNotificationsStore();
const { hasUnread } = storeToRefs(notifications);
const { toggle } = notifications;
const router = useRouter();

function goBack() {
  router.back();
}
</script>
