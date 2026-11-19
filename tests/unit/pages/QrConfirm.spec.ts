import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { flushPromises, mount } from '@vue/test-utils';
import { confirmQrLogin } from '@/api/qr';
import { ApiError } from '@/api/http';
import QrConfirm from '@/pages/QrConfirm/QrConfirm.vue';

const routerMocks = vi.hoisted(() => ({
  replace: vi.fn(),
  back: vi.fn(),
  query: {} as Record<string, string>,
}));

vi.mock('vue-router', async () => {
  const actual = await vi.importActual<typeof import('vue-router')>('vue-router');
  return {
    ...actual,
    useRouter: () => ({ replace: routerMocks.replace, back: routerMocks.back }),
    useRoute: () => ({ query: routerMocks.query }),
  };
});

vi.mock('@/api/qr', () => ({
  startQrLogin: vi.fn(),
  fetchQrStatus: vi.fn(),
  confirmQrLogin: vi.fn(),
}));

const confirmMock = vi.mocked(confirmQrLogin);

function mountPage() {
  const pinia = createPinia();
  setActivePinia(pinia);
  return mount(QrConfirm, { global: { plugins: [pinia] } });
}

describe('pages/QrConfirm', () => {
  beforeEach(() => {
    routerMocks.query = {};
  });

  it('подтверждение шлёт код из query', async () => {
    routerMocks.query = { code: 'ABC123' };
    confirmMock.mockResolvedValue({ status: 'confirmed' });
    const wrapper = mountPage();

    expect(wrapper.text()).toContain('Устройство просит вход');
    await wrapper.find('button.btn-primary').trigger('click');
    await flushPromises();

    expect(confirmMock).toHaveBeenCalledWith('ABC123');
    expect(wrapper.text()).toContain('Вход подтверждён');
  });

  it('404 → состояние «код не найден»', async () => {
    routerMocks.query = { code: 'OLD' };
    confirmMock.mockRejectedValue(new ApiError(404, 'not-found', 'QR-код не найден.'));
    const wrapper = mountPage();

    await wrapper.find('button.btn-primary').trigger('click');
    await flushPromises();

    expect(wrapper.text()).toContain('Код не найден или устарел');
  });

  it('без code → редирект на /home', () => {
    mountPage();
    expect(routerMocks.replace).toHaveBeenCalledWith('/home');
  });
});
