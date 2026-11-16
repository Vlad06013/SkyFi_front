import { defineStore } from 'pinia';
import { ref } from 'vue';

export const useToastStore = defineStore('toast', () => {
  const toast = ref<{ title: string; who: string } | null>(null);
  let timer: ReturnType<typeof setTimeout> | null = null;

  function show(title: string, who: string) {
    toast.value = { title, who };
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      toast.value = null;
    }, 5000);
  }

  return { toast, show };
});
