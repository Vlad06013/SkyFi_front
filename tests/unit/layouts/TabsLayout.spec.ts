import { describe, expect, it } from 'vitest';
import { defineComponent } from 'vue';
import { mount, flushPromises } from '@vue/test-utils';
import { createMemoryHistory, createRouter } from 'vue-router';
import { createPinia } from 'pinia';
import TabsLayout from '@/layouts/TabsLayout/TabsLayout.vue';

const Page = defineComponent({
  props: { label: { type: String, required: true } },
  template: '<div class="page">{{ label }}</div>',
});

function installScroll(el: HTMLElement) {
  let top = 0;
  Object.defineProperty(el, 'scrollTop', {
    configurable: true,
    get: () => top,
    set: (value: number) => {
      top = value;
    },
  });
}

async function mountLayout() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      {
        path: '/',
        component: TabsLayout,
        children: [
          { path: 'home', component: Page, props: { label: 'home' } },
          { path: 'library', component: Page, props: { label: 'library' } },
        ],
      },
    ],
  });
  const wrapper = mount(
    defineComponent({ template: '<router-view />' }),
    {
      global: {
        plugins: [router, createPinia()],
        stubs: { MiniPlayer: true, TabBar: true, NotificationPanel: true, NowPlaying: true },
      },
    },
  );
  await router.push('/library');
  await router.isReady();
  await flushPromises();
  const body = wrapper.get('.sky-body').element as HTMLElement;
  installScroll(body);
  return { wrapper, router, body };
}

describe('layouts/TabsLayout — прокрутка вкладок', () => {
  it('сдвиг «Моего» не уносит главную и возвращается при возврате', async () => {
    const { router, body } = await mountLayout();

    body.scrollTop = 480;
    await router.push('/home');
    await flushPromises();
    expect(body.scrollTop).toBe(0);

    await router.push('/library');
    await flushPromises();
    expect(body.scrollTop).toBe(480);
  });
});
