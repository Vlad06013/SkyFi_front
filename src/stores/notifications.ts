import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { incomingRequest } from '@/mocks/friends';

export const useNotificationsStore = defineStore('notifications', () => {
  const open = ref(false);
  const request = ref<{ id: number; name: string; initial: string; tone: 'g1' } | null>(incomingRequest);
  const hasUnread = computed(() => request.value !== null);

  function toggle() {
    open.value = !open.value;
  }

  function close() {
    open.value = false;
  }

  function accept() {
    request.value = null;
    open.value = false;
  }

  function decline() {
    request.value = null;
    open.value = false;
  }

  return { open, request, hasUnread, toggle, close, accept, decline };
});
