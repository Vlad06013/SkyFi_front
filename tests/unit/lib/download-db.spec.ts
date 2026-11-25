import { isProxy, reactive } from 'vue';
import { describe, expect, it } from 'vitest';
import { cloneForDb } from '@/lib/download-db';

describe('lib/download-db cloneForDb', () => {
  it('снимает реактивность, чтобы IndexedDB мог клонировать запись', () => {
    const row = reactive({
      snapshot: { title: 'радиотишина', artists: [{ name: 'завтра' }] },
    });

    const copy = cloneForDb(row);

    expect(isProxy(copy)).toBe(false);
    expect(isProxy(copy.snapshot)).toBe(false);
    expect(isProxy(copy.snapshot.artists[0])).toBe(false);
    expect(copy.snapshot.title).toBe('радиотишина');
    expect(copy).not.toBe(row);
  });
});
