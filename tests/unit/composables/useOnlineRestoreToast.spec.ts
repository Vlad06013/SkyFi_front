import { beforeEach, describe, expect, it } from 'vitest';
import { nextTick } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { useOnlineRestoreToast } from '@/composables/useOnlineRestoreToast';
import { useOnlineStore } from '@/stores/online';
import { useToastStore } from '@/stores/toast';

describe('composables/useOnlineRestoreToast', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  function setup() {
    const online = useOnlineStore();
    const toast = useToastStore();
    useOnlineRestoreToast();
    return { online, toast };
  }

  it('вход в офлайн: тост «Офлайн-режим»', async () => {
    const { online, toast } = setup();
    online.isOnline = false;
    await nextTick();
    expect(toast.toast?.title).toBe('Офлайн-режим');
  });

  it('повторный офлайн тост не дублирует', async () => {
    const { online, toast } = setup();
    online.isOnline = false;
    await nextTick();
    toast.toast = null;
    online.isOnline = false;
    await nextTick();
    expect(toast.toast).toBeNull();
  });

  it('офлайн → онлайн: тост «Соединение восстановлено»', async () => {
    const { online, toast } = setup();
    online.isOnline = false;
    await nextTick();
    online.isOnline = true;
    await nextTick();
    expect(toast.toast?.title).toBe('Соединение восстановлено');
  });

  it('первый переход null → true тостом не считается', () => {
    const { online, toast } = setup();
    online.isOnline = true;
    expect(toast.toast).toBeNull();
  });

  it('повторные true без офлайна тост не дают', () => {
    const { online, toast } = setup();
    online.isOnline = true;
    online.isOnline = true;
    expect(toast.toast).toBeNull();
  });
});
