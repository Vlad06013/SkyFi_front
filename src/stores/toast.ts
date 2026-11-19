import { defineStore } from 'pinia';
import { ref } from 'vue';

export interface ToastItem {
  title: string;
  who: string;
  error: boolean;
}

export const useToastStore = defineStore('toast', () => {
  const toast = ref<ToastItem | null>(null);
  let timer: ReturnType<typeof setTimeout> | null = null;

  function show(title: string, who = '', error = false) {
    toast.value = { title, who, error };
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      toast.value = null;
    }, 5000);
  }

  return { toast, show };
});
