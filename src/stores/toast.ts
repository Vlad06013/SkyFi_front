import { defineStore } from 'pinia';
import { ref } from 'vue';

export interface ToastAction {
  label: string;
  run: () => void;
}

export interface ToastItem {
  title: string;
  who: string;
  error: boolean;
  action?: ToastAction;
}

export const useToastStore = defineStore('toast', () => {
  const toast = ref<ToastItem | null>(null);
  let timer: ReturnType<typeof setTimeout> | null = null;

  function hide() {
    if (timer) clearTimeout(timer);
    timer = null;
    toast.value = null;
  }

  function show(title: string, who = '', error = false, action?: ToastAction) {
    toast.value = { title, who, error, action };
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      toast.value = null;
    }, action ? 12_000 : 5_000);
  }

  function runAction() {
    const action = toast.value?.action;
    hide();
    action?.run();
  }

  return { toast, show, hide, runAction };
});
