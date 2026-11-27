import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { flushPromises, mount } from '@vue/test-utils';
import * as authApi from '@/api/auth';
import * as qrApi from '@/api/qr';
import { getSession } from '@/lib/session';
import { ApiError } from '@/api/http';
import { useAuthStore } from '@/stores/auth';
import { useOnlineStore } from '@/stores/online';
import { useToastStore } from '@/stores/toast';
import Login from '@/pages/Login/Login.vue';

const routerMocks = vi.hoisted(() => ({
  replace: vi.fn(),
  query: {} as Record<string, string>,
}));

vi.mock('vue-router', async () => {
  const actual = await vi.importActual<typeof import('vue-router')>('vue-router');
  return {
    ...actual,
    useRouter: () => ({ replace: routerMocks.replace }),
    useRoute: () => ({ query: routerMocks.query }),
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

vi.mock('@/api/qr', () => ({
  startQrLogin: vi.fn(),
  fetchQrStatus: vi.fn(),
  confirmQrLogin: vi.fn(),
}));

vi.mock('@/lib/session', () => ({
  getSession: vi.fn(),
  setSession: vi.fn(),
  clearSession: vi.fn(),
}));

const loginMock = vi.mocked(authApi.login);
const registerMock = vi.mocked(authApi.register);
const forgotMock = vi.mocked(authApi.forgotPassword);
const resetMock = vi.mocked(authApi.resetPassword);
const fetchUserMock = vi.mocked(authApi.fetchUser);
const getSessionMock = vi.mocked(getSession);
const startQrMock = vi.mocked(qrApi.startQrLogin);
const qrStatusMock = vi.mocked(qrApi.fetchQrStatus);

const payload = {
  token: 't1',
  user: { id: 1, name: 'Влад', email: 'vlad@mail.ru', avatar_url: null },
};

function mountLogin() {
  // Один pinia и на тест, и на компонент — иначе стор в тесте
  // и стор на странице окажутся разными инстансами.
  const pinia = createPinia();
  setActivePinia(pinia);
  return mount(Login, { global: { plugins: [pinia] } });
}

async function submit(wrapper: ReturnType<typeof mountLogin>) {
  await wrapper.find('form').trigger('submit.prevent');
  await flushPromises();
}

describe('pages/Login', () => {
  beforeEach(() => {
    routerMocks.query = {};
  });

  it('вход: шлёт поля формы и редиректит на /home', async () => {
    loginMock.mockResolvedValue(payload);
    const wrapper = mountLogin();
    await wrapper.find('input[type="email"]').setValue('vlad@mail.ru');
    await wrapper.find('input[type="password"]').setValue('secret123');
    await submit(wrapper);

    expect(loginMock).toHaveBeenCalledWith('vlad@mail.ru', 'secret123');
    expect(routerMocks.replace).toHaveBeenCalledWith('/home');
    expect(useAuthStore().isAuthed).toBe(true);
  });

  it('вход: редирект на redirect из query', async () => {
    routerMocks.query = { redirect: '/search' };
    loginMock.mockResolvedValue(payload);
    const wrapper = mountLogin();
    await wrapper.find('input[type="email"]').setValue('a@b.c');
    await wrapper.find('input[type="password"]').setValue('secret123');
    await submit(wrapper);

    expect(routerMocks.replace).toHaveBeenCalledWith('/search');
  });

  it('422: рисует ошибку под полем и подсвечивает его', async () => {
    loginMock.mockRejectedValue(new ApiError(422, 'validation', 'Проверьте поля.', { email: ['Некорректный email'] }));
    const wrapper = mountLogin();
    await wrapper.find('input[type="email"]').setValue('bad');
    await wrapper.find('input[type="password"]').setValue('x');
    await submit(wrapper);

    expect(wrapper.text()).toContain('Некорректный email');
    expect(wrapper.find('.field.is-error').exists()).toBe(true);
    expect(useAuthStore().isAuthed).toBe(false);
  });

  it('pending: блокирует кнопку и повторный сабмит', async () => {
    loginMock.mockReturnValue(new Promise(() => {}));
    const wrapper = mountLogin();
    await wrapper.find('input[type="email"]').setValue('a@b.c');
    await wrapper.find('input[type="password"]').setValue('secret123');
    await submit(wrapper);

    const button = wrapper.find('button.btn-primary');
    expect(button.attributes('disabled')).toBeDefined();

    await wrapper.find('form').trigger('submit.prevent');
    expect(loginMock).toHaveBeenCalledTimes(1);
  });

  it('регистрация: уходит password_confirmation', async () => {
    registerMock.mockResolvedValue(payload);
    const wrapper = mountLogin();
    await wrapper.find('.link').trigger('click'); // «Создать»
    const inputs = wrapper.findAll('input');
    await inputs[0].setValue('Влад');
    await inputs[1].setValue('vlad@mail.ru');
    await inputs[2].setValue('secret123');
    await inputs[3].setValue('secret123');
    await submit(wrapper);

    expect(registerMock).toHaveBeenCalledWith({
      name: 'Влад',
      email: 'vlad@mail.ru',
      password: 'secret123',
      password_confirmation: 'secret123',
    });
    expect(routerMocks.replace).toHaveBeenCalledWith('/home');
  });

  it('forgot: шлёт email и переключается в reset', async () => {
    forgotMock.mockResolvedValue({ message: 'Если пользователь существует, код отправлен.' });
    const wrapper = mountLogin();
    await wrapper.findAll('.link')[1].trigger('click'); // «забыл пароль»
    await wrapper.find('input[type="email"]').setValue('vlad@mail.ru');
    await submit(wrapper);

    expect(forgotMock).toHaveBeenCalledWith('vlad@mail.ru');
    expect(wrapper.text()).toContain('Код из письма');
  });

  it('reset: шлёт код и новый пароль, возвращает на вход', async () => {
    resetMock.mockResolvedValue({ message: 'Пароль обновлён' });
    const wrapper = mountLogin();
    await wrapper.findAll('.link')[1].trigger('click'); // forgot
    await wrapper.find('input[type="email"]').setValue('vlad@mail.ru');
    await submit(wrapper); // → reset

    const inputs = wrapper.findAll('input');
    await inputs[0].setValue('123456');
    await inputs[1].setValue('newsecret1');
    await inputs[2].setValue('newsecret1');
    await submit(wrapper);

    expect(resetMock).toHaveBeenCalledWith({
      email: 'vlad@mail.ru',
      code: '123456',
      password: 'newsecret1',
      password_confirmation: 'newsecret1',
    });
    expect(wrapper.find('input[type="email"]').exists()).toBe(true);
  });

  it('после конца сессии офлайн-заглушка снимается и «Войти» снова живая', async () => {
    loginMock.mockResolvedValue(payload);
    const wrapper = mountLogin();
    const online = useOnlineStore();
    online.noteSocketConnected();
    online.noteSocketDisconnected();
    online.noteSessionEnded();
    await flushPromises();

    expect(wrapper.find('.auth-offline').exists()).toBe(false);
    expect(wrapper.find('button.btn-primary').attributes('disabled')).toBeUndefined();

    await wrapper.find('input[type="email"]').setValue('a@b.c');
    await wrapper.find('input[type="password"]').setValue('secret');
    await submit(wrapper);
    expect(loginMock).toHaveBeenCalledWith('a@b.c', 'secret');
  });

  it('офлайн: баннер, сабмит заблокирован', async () => {
    const wrapper = mountLogin();
    useOnlineStore().isOnline = false;
    await flushPromises();

    expect(wrapper.find('.auth-offline').exists()).toBe(true);
    await wrapper.find('input[type="email"]').setValue('a@b.c');
    await wrapper.find('input[type="password"]').setValue('x');
    await submit(wrapper);

    expect(loginMock).not.toHaveBeenCalled();
    expect(useToastStore().toast?.error).toBe(true);
  });

  it('«Повторить» после восстановления сети уводит authed на /home', async () => {
    const wrapper = mountLogin();
    useOnlineStore().isOnline = false;
    await flushPromises();

    getSessionMock.mockResolvedValue(payload);
    fetchUserMock.mockResolvedValue(payload.user);

    await wrapper.find('.auth-offline .link').trigger('click');
    await vi.waitFor(() => expect(routerMocks.replace).toHaveBeenCalledWith('/home'));
  });

  it('QR: режим стартует поллинг, confirmed логинит без пароля', async () => {
    startQrMock.mockResolvedValue({
      code: 'c1',
      expires_at: new Date(Date.now() + 60_000).toISOString(),
      qr_svg: '<svg>qr</svg>',
    });
    // Сначала pending — проверяем отрисованный QR, потом подтверждение.
    qrStatusMock.mockResolvedValueOnce({ status: 'pending', token: null, user: null });
    const wrapper = mountLogin();

    const qrButton = wrapper.findAll('button').find((b) => b.text().includes('QR'));
    await qrButton!.trigger('click');
    await vi.waitFor(() => expect(wrapper.find('.qr-box svg').exists()).toBe(true));
    expect(startQrMock).toHaveBeenCalledTimes(1);

    qrStatusMock.mockResolvedValue({ status: 'confirmed', token: 'qr-token', user: payload.user });
    // Следующий тик поллинга — через 2 с.
    await vi.waitFor(() => expect(routerMocks.replace).toHaveBeenCalledWith('/home'), { timeout: 3_000 });
    expect(useAuthStore().token).toBe('qr-token');
  });

  it('QR: офлайн — режим не стартует, тост ошибки', async () => {
    const wrapper = mountLogin();
    useOnlineStore().isOnline = false;
    await flushPromises();

    const qrButton = wrapper.findAll('button').find((b) => b.text().includes('QR'));
    await qrButton!.trigger('click');
    await flushPromises();

    expect(startQrMock).not.toHaveBeenCalled();
    expect(useToastStore().toast?.error).toBe(true);
  });
});
