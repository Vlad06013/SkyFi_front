import { Capacitor } from '@capacitor/core';
import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import {
  applyLayoutProfile,
  defaultLayoutProfile,
  peekLayoutProfile,
  readLayoutProfile,
  writeLayoutProfile,
  type LayoutProfile,
} from '@/lib/layout-profile';

export const useLayoutStore = defineStore('layout', () => {
  const profile = ref<LayoutProfile>(peekLayoutProfile() ?? defaultLayoutProfile());
  applyLayoutProfile(profile.value);

  const options = computed(() => {
    const all: { id: LayoutProfile; label: string }[] = [
      { id: 'auto', label: 'Как сейчас' },
      { id: 'phone', label: 'Телефон' },
      { id: 'tv', label: 'Телевизор' },
      { id: 'car', label: 'Автомагнитола' },
    ];
    return Capacitor.isNativePlatform() ? all.filter((option) => option.id !== 'auto') : all;
  });

  async function hydrate(): Promise<void> {
    const stored = await readLayoutProfile();
    profile.value = stored;
    applyLayoutProfile(stored);
  }

  async function setProfile(next: LayoutProfile): Promise<void> {
    profile.value = next;
    applyLayoutProfile(next);
    await writeLayoutProfile(next);
  }

  return { profile, options, hydrate, setProfile };
});
