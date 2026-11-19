import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { flushPromises, mount } from '@vue/test-utils';
import type { Pinia } from 'pinia';
import * as authApi from '@/api/auth';
import { useAuthStore } from '@/stores/auth';
import Settings from '@/pages/Settings/Settings.vue';
import QrScannerSheet from '@/components/QrScannerSheet/QrScannerSheet.vue';
import SettingRow from '@/components/SettingRow/SettingRow.vue';

const routerMocks = vi.hoisted(() => ({
  replace: vi.fn(),
}));

vi.mock('vue-router', async () => {
  const actual = await vi.importActual<typeof import('vue-router')>('vue-router');
  return {
    ...actual,
    useRouter: () => ({ replace: routerMocks.replace, push: vi.fn() }),
  };
});

vi.mock('@/api/auth', () => ({
  login: vi.fn(),
  register: vi.fn(),
  fetchUser: vi.fn(),
  logout: vi.fn(),
  forgotPassword: vi.fn(),
  resetPassword: vi.fn(),
  updateProfile: vi.fn(),
  uploadAvatar: vi.fn(),
  deleteAvatar: vi.fn(),
}));

vi.mock('@/lib/session', () => ({
  getSession: vi.fn(),
  setSession: vi.fn(),
  clearSession: vi.fn(),
}));

const updateProfileMock = vi.mocked(authApi.updateProfile);
const uploadAvatarMock = vi.mocked(authApi.uploadAvatar);
const logoutMock = vi.mocked(authApi.logout);

const user = { id: 1, name: 'Влад', email: 'vlad@mail.ru', avatar_url: null };

let pinia: Pinia;

function mountSettings() {
  return mount(Settings, {
    global: {
      plugins: [pinia],
      stubs: {
        AppBar: true,
        AppSheet: { template: '<div><slot /></div>' },
        SeekBar: true,
        SettingRow: true,
        YandexCard: true,
      },
    },
  });
}

describe('pages/Settings', () => {
  beforeEach(() => {
    pinia = createPinia();
    setActivePinia(pinia);
    const auth = useAuthStore();
    auth.user = user;
    auth.token = 't1';
  });

  it('сохранение имени шлёт PATCH через стор', async () => {
    updateProfileMock.mockResolvedValue({ ...user, name: 'Владик' });
    const wrapper = mountSettings();

    // Открываем шит имени карандашом (AppSheet заглушен — слот виден сразу).
    await wrapper.find('button[aria-label="изменить имя"]').trigger('click');
    await wrapper.find('form input').setValue('Владик');
    await wrapper.find('form').trigger('submit.prevent');
    await flushPromises();

    expect(updateProfileMock).toHaveBeenCalledWith('Владик');
    expect(useAuthStore().user?.name).toBe('Владик');
  });

  it('загрузка аватара шлёт файл', async () => {
    uploadAvatarMock.mockResolvedValue({ ...user, avatar_url: 'https://img/a.png' });
    const wrapper = mountSettings();
    const file = new File(['x'], 'a.png', { type: 'image/png' });

    const input = wrapper.find('input[type="file"]');
    Object.defineProperty(input.element, 'files', { value: [file] });
    await input.trigger('change');
    await flushPromises();

    expect(uploadAvatarMock).toHaveBeenCalledWith(file);
    expect(useAuthStore().user?.avatar_url).toBe('https://img/a.png');
  });

  it('выход зовёт API, чистит состояние и редиректит', async () => {
    logoutMock.mockResolvedValue({ message: 'Выход выполнен успешно' });
    const wrapper = mountSettings();

    await wrapper.find('.logout-wrap button').trigger('click');
    await flushPromises();

    expect(logoutMock).toHaveBeenCalledTimes(1);
    expect(useAuthStore().isAuthed).toBe(false);
    expect(routerMocks.replace).toHaveBeenCalledWith('/login');
  });

  it('кнопка «Сканировать QR» открывает шит сканера', async () => {
    const wrapper = mount(Settings, {
      global: {
        plugins: [pinia],
        stubs: {
          AppBar: true,
          AppSheet: { template: '<div><slot /></div>' },
          SeekBar: true,
          YandexCard: true,
          QrScannerSheet: { props: ['open'], template: '<div class="qr-scanner-stub" />' },
        },
      },
    });

    expect(wrapper.text()).toContain('Сканировать QR');
    const qrRow = wrapper
      .findAllComponents(SettingRow)
      .find((row) => row.props('title') === 'Сканировать QR');
    expect(qrRow).toBeDefined();
    await qrRow!.trigger('click');
    expect(wrapper.findComponent(QrScannerSheet).props('open')).toBe(true);
  });
});
