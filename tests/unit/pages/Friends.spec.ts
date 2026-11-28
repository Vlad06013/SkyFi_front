import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { flushPromises, mount } from '@vue/test-utils';
import * as friendsApi from '@/api/friends';
import Friends from '@/pages/Friends/Friends.vue';
import { refreshActivePage } from '@/composables/usePageRefresh';
import { useAuthStore } from '@/stores/auth';
import { useFriendsStore } from '@/stores/friends';
import type { FriendshipPayload, UserSearchItem } from '@/types';

const routerMocks = vi.hoisted(() => ({
  push: vi.fn(),
}));

vi.mock('vue-router', async () => {
  const actual = await vi.importActual<typeof import('vue-router')>('vue-router');
  return {
    ...actual,
    useRoute: () => ({ name: 'friends' }),
    useRouter: () => ({ push: routerMocks.push }),
  };
});

vi.mock('@/api/friends', () => ({
  fetchFriendshipOverview: vi.fn(),
  searchUsers: vi.fn(),
  sendFriendRequest: vi.fn(),
  acceptFriendRequest: vi.fn(),
  removeFriend: vi.fn(),
  fetchFriendProfile: vi.fn(),
  fetchFriendNowPlaying: vi.fn(),
  fetchFriendFavorites: vi.fn(),
  fetchFriendQueue: vi.fn(),
  moveFriendQueueItem: vi.fn(),
  addToFriendQueue: vi.fn(),
  shareWithFriend: vi.fn(),
}));

const overviewMock = vi.mocked(friendsApi.fetchFriendshipOverview);
const searchUsersMock = vi.mocked(friendsApi.searchUsers);
const sendMock = vi.mocked(friendsApi.sendFriendRequest);
const acceptMock = vi.mocked(friendsApi.acceptFriendRequest);
const removeMock = vi.mocked(friendsApi.removeFriend);

function searchItem(patch: Partial<UserSearchItem>): UserSearchItem {
  return {
    user_id: 0,
    name: '',
    email: '',
    avatar_url: null,
    friendship_status: null,
    ...patch,
  };
}

function makeFriendship(id: number, senderId: number, receiverId: number): FriendshipPayload {
  return {
    id,
    sender: { id: senderId, name: `User${senderId}`, avatar_url: null, current_snapshot: null },
    receiver: { id: receiverId, name: `User${receiverId}`, avatar_url: null, current_snapshot: null },
    status: 'pending',
    created_at: null,
  };
}

// Реальные значения бэка (curl 2026-11-27): enum БД в верхнем регистре,
// направление PENDING не кодируется — его дают списки стора.
const FOUND: UserSearchItem[] = [
  searchItem({ user_id: 2, name: 'Катя', email: 'katya@mail.ru', friendship_status: 'PENDING' }),
  searchItem({ user_id: 3, name: 'Никита', email: 'nikita@mail.ru', friendship_status: 'PENDING' }),
  searchItem({ user_id: 4, name: 'Аня', email: 'anya@mail.ru', friendship_status: 'ACCEPTED' }),
  searchItem({ user_id: 7, name: 'Макс', email: 'max@mail.ru' }),
];

function rowByName(wrapper: ReturnType<typeof mount>, name: string) {
  const row = wrapper.findAll('.friend-row').find((item) => item.text().includes(name));
  expect(row, `строка «${name}»`).toBeDefined();
  return row!;
}

describe('pages/Friends', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    setActivePinia(createPinia());
    overviewMock.mockReset();
    searchUsersMock.mockReset();
    sendMock.mockReset();
    acceptMock.mockReset();
    removeMock.mockReset();
    overviewMock.mockResolvedValue({
      friends: [],
      incoming: [makeFriendship(9, 3, 1)],
      outgoing: [makeFriendship(10, 1, 2)],
    } as never);
    searchUsersMock.mockResolvedValue(FOUND as never);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function authAsMe() {
    const auth = useAuthStore();
    auth.user = { id: 1, name: 'Я', email: 'me@skyfi.app', avatar_url: null };
  }

  async function mountPage(populate = true) {
    const pinia = createPinia();
    setActivePinia(pinia);
    authAsMe();
    const wrapper = mount(Friends, { global: { plugins: [pinia] } });
    if (populate) await useFriendsStore().fetchAll();
    return wrapper;
  }

  async function typeAndSearch(value: string) {
    const wrapper = await mountPage();
    await wrapper.find('input').setValue(value);
    await vi.advanceTimersByTimeAsync(400);
    await flushPromises();
    return wrapper;
  }

  it('поиск: заявки (входящие/исходящие) сверху отдельно, остальные — в «Найдено»', async () => {
    const wrapper = await typeAndSearch('а');

    expect(searchUsersMock).toHaveBeenCalledWith('а');
    const labels = wrapper.findAll('.sec-label').map((label) => label.text());
    expect(labels.some((label) => label.includes('Заявки'))).toBe(true);
    expect(labels.some((label) => label.includes('Найдено'))).toBe(true);

    // Катя — исходящая: статус + «Отменить»
    const katya = rowByName(wrapper, 'Катя');
    expect(katya.text()).toContain('заявка отправлена');
    expect(katya.find('.btn').text()).toBe('Отменить');

    // Никита — входящая: галка и крестик
    const nikita = rowByName(wrapper, 'Никита');
    expect(nikita.text()).toContain('хочет в друзья');
    expect(nikita.find('[aria-label="принять"]').exists()).toBe(true);
    expect(nikita.find('[aria-label="отклонить"]').exists()).toBe(true);

    // Аня — уже друзья: плашка, без кнопки добавления
    const anya = rowByName(wrapper, 'Аня');
    expect(anya.text()).toContain('Друзья');
    expect(anya.find('.btn').exists()).toBe(false);

    // Макс — чужой: кнопка «Добавить»
    const max = rowByName(wrapper, 'Макс');
    expect(max.find('.btn').text()).toBe('Добавить');
  });

  it('«Отменить» в поиске шлёт DELETE по user id и возвращает пользователя в общий список', async () => {
    removeMock.mockResolvedValue({} as never);
    const wrapper = await typeAndSearch('а');

    await rowByName(wrapper, 'Катя').find('.btn').trigger('click');
    await flushPromises();

    expect(removeMock).toHaveBeenCalledWith(2);
    const katya = rowByName(wrapper, 'Катя');
    expect(katya.find('.btn').text()).toBe('Добавить');
  });

  it('«Добавить» шлёт заявку, строка уходит в заявки со «Отменить»', async () => {
    sendMock.mockResolvedValue(makeFriendship(11, 1, 7) as never);
    const wrapper = await typeAndSearch('а');

    await rowByName(wrapper, 'Макс').find('.btn').trigger('click');
    await flushPromises();

    expect(sendMock).toHaveBeenCalledWith(7);
    const max = rowByName(wrapper, 'Макс');
    expect(max.text()).toContain('заявка отправлена');
    expect(max.find('.btn').text()).toBe('Отменить');
  });

  it('входящую заявку из поиска можно принять', async () => {
    acceptMock.mockResolvedValue(makeFriendship(9, 3, 1) as never);
    const wrapper = await typeAndSearch('а');

    await rowByName(wrapper, 'Никита').find('[aria-label="принять"]').trigger('click');
    await flushPromises();

    expect(acceptMock).toHaveBeenCalledWith(3);
    const nikita = rowByName(wrapper, 'Никита');
    expect(nikita.text()).toContain('Друзья');
  });

  it('PENDING без загруженных списков стора — фолбэк «Отменить», а не «Добавить» с 422', async () => {
    const wrapper = await mountPage(false);
    await wrapper.find('input').setValue('а');
    await vi.advanceTimersByTimeAsync(400);
    await flushPromises();

    const katya = rowByName(wrapper, 'Катя');
    expect(katya.text()).toContain('заявка отправлена');
    expect(katya.find('.btn').text()).toBe('Отменить');
  });

  it('заявку приняли по сокету: строка поиска сама становится «Друзья», без перезагрузки', async () => {
    const wrapper = await typeAndSearch('а');
    expect(rowByName(wrapper, 'Катя').text()).toContain('заявка отправлена');

    // Сокет friendship.request.accepted: стор переносит outgoing → friends.
    useFriendsStore().applyRequestAccepted(makeFriendship(10, 1, 2));
    await flushPromises();

    const katya = rowByName(wrapper, 'Катя');
    expect(katya.text()).toContain('Друзья');
    expect(katya.text()).not.toContain('заявка отправлена');
  });

  it('заявку сняли без сокета: свежий обзор без человека убирает «заявка отправлена»', async () => {
    const wrapper = await typeAndSearch('а');
    expect(rowByName(wrapper, 'Катя').text()).toContain('заявка отправлена');

    overviewMock.mockResolvedValue({ friends: [], incoming: [], outgoing: [] });
    await useFriendsStore().fetchAll();
    await flushPromises();

    const katya = rowByName(wrapper, 'Катя');
    expect(katya.text()).not.toContain('заявка отправлена');
    expect(katya.find('.btn').text()).toBe('Добавить');
  });

  it('свайп перечитывает поиск и ставит статус из свежей выдачи', async () => {
    const wrapper = await typeAndSearch('а');
    overviewMock.mockResolvedValue({ friends: [], incoming: [], outgoing: [] });
    searchUsersMock.mockResolvedValue(
      FOUND.map((item) => (item.user_id === 2 ? { ...item, friendship_status: null } : item)) as never,
    );

    await refreshActivePage('friends');
    await flushPromises();

    expect(searchUsersMock).toHaveBeenCalledWith('а');
    expect(rowByName(wrapper, 'Катя').find('.btn').text()).toBe('Добавить');
  });
});
