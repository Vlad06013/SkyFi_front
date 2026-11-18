import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { mockUser } from '@/mocks/user';
import type { AuthUser } from '@/types';

export const useAuthStore = defineStore('auth', () => {
  const user = ref<AuthUser | null>(mockUser);
  const isAuthed = computed(() => user.value !== null);

  function logout() {
    user.value = null;
  }

  function login(name = mockUser.name, email = mockUser.email) {
    user.value = { ...mockUser, name, email };
  }

  function rename(name: string) {
    if (!user.value) return;
    user.value = { ...user.value, name };
  }

  function setAvatar(avatar: string | null) {
    if (!user.value) return;
    user.value = { ...user.value, avatar };
  }

  return { user, isAuthed, logout, login, rename, setAvatar };
});
