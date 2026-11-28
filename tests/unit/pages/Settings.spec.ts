import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { flushPromises, mount } from '@vue/test-utils';
import type { Pinia } from 'pinia';
import * as authApi from '@/api/auth';
import { useAuthStore } from '@/stores/auth';
import { useOnlineStore } from '@/stores/online';
import { useToastStore } from '@/stores/toast';
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
    useRoute: () => ({ name: 'settings' }),
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

const appUpdatesMocks = vi.hoisted(() => ({
  fetchLatestApk: vi.fn(),
}));

vi.mock('@/api/app-updates', () => ({
  fetchAppUpdate: vi.fn(async () => null),
  fetchLatestApk: appUpdatesMocks.fetchLatestApk,
}));

const externalMocks = vi.hoisted(() => ({
  openExternalUrl: vi.fn(),
}));

vi.mock('@/lib/external-url', () => ({
  openExternalUrl: externalMocks.openExternalUrl,
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
    appUpdatesMocks.fetchLatestApk.mockReset();
    externalMocks.openExternalUrl.mockReset();
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

  it('браузер качает опубликованный APK по подписанной ссылке', async () => {
    const offer = {
      kind: 'apk' as const,
      version: '1.2.0',
      url: 'https://api.example/api/download-apk/7?signature=abc',
      sha256: 'aa',
      size_bytes: 10,
      mandatory: false,
      notes: null,
    };
    appUpdatesMocks.fetchLatestApk.mockResolvedValue(offer);
    const open = vi.spyOn(window, 'open').mockImplementation(() => ({}) as Window);
    const wrapper = mount(Settings, {
      global: {
        plugins: [pinia],
        stubs: {
          AppBar: true,
          AppSheet: { template: '<div><slot /></div>' },
          SeekBar: true,
          YandexCard: true,
        },
      },
    });

    const entry = wrapper
      .findAllComponents(SettingRow)
      .find((row) => row.props('title') === 'Скачать приложение');
    await entry!.trigger('click');
    await flushPromises();

    const apkRow = wrapper
      .findAllComponents(SettingRow)
      .find((row) => row.props('title') === 'Android · APK');
    expect(apkRow!.props('idle')).toBe('версия 1.2.0');
    await apkRow!.trigger('click');
    await flushPromises();

    expect(open).toHaveBeenCalledWith(offer.url, '_blank', 'noopener');
    expect(externalMocks.openExternalUrl).not.toHaveBeenCalled();
  });

  it('без опубликованного APK ссылка не открывается', async () => {
    appUpdatesMocks.fetchLatestApk.mockResolvedValue(null);
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    const wrapper = mount(Settings, {
      global: {
        plugins: [pinia],
        stubs: {
          AppBar: true,
          AppSheet: { template: '<div><slot /></div>' },
          SeekBar: true,
          YandexCard: true,
        },
      },
    });

    const apkRow = wrapper
      .findAllComponents(SettingRow)
      .find((row) => row.props('title') === 'Android · APK');
    await apkRow!.trigger('click');
    await flushPromises();

    expect(open).not.toHaveBeenCalled();
    expect(externalMocks.openExternalUrl).not.toHaveBeenCalled();
    expect(useToastStore().toast?.title).toBe('APK пока не опубликован');
  });

  it('интерфейс: автомагнитола ставит data-layout, «Как сейчас» снимает', async () => {
    const wrapper = mountSettings();
    const car = wrapper.findAll('button').find((button) => button.text() === 'Автомагнитола');
    await car!.trigger('click');
    await flushPromises();
    expect(document.documentElement.dataset.layout).toBe('car');

    const auto = wrapper.findAll('button').find((button) => button.text() === 'Как сейчас');
    await auto!.trigger('click');
    await flushPromises();
    expect(document.documentElement.dataset.layout).toBeUndefined();
  });

  it('офлайн: карандаш, аватар и сканнер задизейблены (баг 25)', async () => {
    useOnlineStore().isOnline = false;
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

    expect(wrapper.find('button[aria-label="изменить имя"]').attributes('disabled')).toBeDefined();
    expect(wrapper.find('.pic-plus').classes()).toContain('is-disabled');

    // Тап по аватару не открывает выбор файла.
    const input = wrapper.find('input[type="file"]');
    const clickSpy = vi.spyOn(input.element, 'click');
    await wrapper.find('.pic-plus').trigger('click');
    expect(clickSpy).not.toHaveBeenCalled();

    // Строка сканнера гашена, тап не открывает сканер.
    const qrRow = wrapper
      .findAllComponents(SettingRow)
      .find((row) => row.props('title') === 'Сканировать QR');
    expect(qrRow!.classes()).toContain('is-disabled');
    await qrRow!.trigger('click');
    expect(wrapper.findComponent(QrScannerSheet).props('open')).toBe(false);
  });
});
