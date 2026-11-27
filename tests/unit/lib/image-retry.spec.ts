import { beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { nextTick } from 'vue';
import { bindImageRetry } from '@/lib/image-retry';
import { useOnlineStore } from '@/stores/online';

function countSrcSets(img: HTMLImageElement): () => number {
  const proto = Object.getPrototypeOf(img) as object;
  const descriptor = Object.getOwnPropertyDescriptor(proto, 'src');
  let sets = 0;
  Object.defineProperty(img, 'src', {
    configurable: true,
    get: descriptor?.get,
    set(value: string) {
      sets += 1;
      descriptor?.set?.call(this, value);
    },
  });
  return () => sets;
}

describe('lib/image-retry', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    document.body.innerHTML = '';
  });

  it('на возврате сети перезагружает упавшую картинку', async () => {
    const online = useOnlineStore();
    online.isOnline = false;
    bindImageRetry();
    const img = document.createElement('img');
    img.src = 'https://cdn.test/cover.jpg';
    document.body.appendChild(img);
    const sets = countSrcSets(img);

    img.dispatchEvent(new Event('error'));
    online.isOnline = true;
    await nextTick();

    expect(sets()).toBe(1);
    expect(img.src).toBe('https://cdn.test/cover.jpg');
  });

  it('успешно загруженная картинка ретрая не требует', async () => {
    const online = useOnlineStore();
    online.isOnline = false;
    bindImageRetry();
    const img = document.createElement('img');
    img.src = 'https://cdn.test/ok.jpg';
    document.body.appendChild(img);
    const sets = countSrcSets(img);

    img.dispatchEvent(new Event('error'));
    img.dispatchEvent(new Event('load'));
    online.isOnline = true;
    await nextTick();

    expect(sets()).toBe(0);
  });
});
