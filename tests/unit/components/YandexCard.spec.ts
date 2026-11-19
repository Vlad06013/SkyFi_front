import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import type { Pinia } from 'pinia';
import { flushPromises, mount } from '@vue/test-utils';
import * as yandexApi from '@/api/yandex';
import { useOnlineStore } from '@/stores/online';
import { useToastStore } from '@/stores/toast';
import YandexCard from '@/components/YandexCard/YandexCard.vue';

vi.mock('@/api/yandex', () => ({
  startYandexDeviceAuth: vi.fn(),
  fetchYandexDeviceStatus: vi.fn(),
  disconnectYandex: vi.fn(),
}));

const startMock = vi.mocked(yandexApi.startYandexDeviceAuth);
const statusMock = vi.mocked(yandexApi.fetchYandexDeviceStatus);
const disconnectMock = vi.mocked(yandexApi.disconnectYandex);

let pinia: Pinia;
let writeText: ReturnType<typeof vi.fn>;

function mountCard() {
  return mount(YandexCard, { global: { plugins: [pinia] } });
}

describe('components/YandexCard', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    pinia = createPinia();
    setActivePinia(pinia);
    useOnlineStore().isOnline = true;
    startMock.mockReset();
    statusMock.mockReset();
    disconnectMock.mockReset();
    writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('показывает «Подключить», когда Яндекс не подключён', async () => {
    statusMock.mockResolvedValue({ status: 'not_started', connected: false });
    const wrapper = mountCard();
    await flushPromises();

    expect(statusMock).toHaveBeenCalledTimes(1);
    expect(wrapper.text()).toContain('не подключён');
    expect(wrapper.text()).toContain('Подключить');
  });

  it('клик «Подключить» стартует device flow и показывает код', async () => {
    statusMock.mockResolvedValue({ status: 'not_started', connected: false });
    startMock.mockResolvedValue({ session_id: 's1', status: 'pending', verification_url: 'https://ya.ru/device', user_code: 'sjh6tud4' });
    const wrapper = mountCard();
    await flushPromises();

    await wrapper.find('.ym-card button.btn-primary').trigger('click');
    await flushPromises();

    expect(startMock).toHaveBeenCalledTimes(1);
    expect(wrapper.text()).toContain('sjh6tud4');
    expect(wrapper.text()).toContain('ya.ru/device');
    // Ссылка на Яндекс ведёт на реальный verification_url.
    expect(wrapper.find('a.btn-primary').attributes('href')).toBe('https://ya.ru/device');
  });

  it('офлайн: кнопка не стартует флоу, а отвечает тостом', async () => {
    useOnlineStore().isOnline = false;
    statusMock.mockResolvedValue({ status: 'not_started', connected: false });
    const wrapper = mountCard();
    await flushPromises();

    await wrapper.find('.ym-card button.btn-primary').trigger('click');
    await flushPromises();

    expect(startMock).not.toHaveBeenCalled();
    expect(useToastStore().toast?.title).toBe('Нет соединения с сервером');
  });

  it('поллинг дождался подтверждения → «подключён» и кнопка «Отключить»', async () => {
    statusMock
      .mockResolvedValueOnce({ status: 'not_started', connected: false })
      .mockResolvedValue({ status: 'connected', connected: true, message: 'ок' });
    startMock.mockResolvedValue({ session_id: 's1', status: 'pending', verification_url: 'https://ya.ru/device', user_code: 'c1' });
    const wrapper = mountCard();
    await flushPromises();

    await wrapper.find('.ym-card button.btn-primary').trigger('click');
    await flushPromises();
    expect(wrapper.text()).toContain('ждём подтверждение');

    await vi.advanceTimersByTimeAsync(3_000);
    await flushPromises();

    expect(wrapper.text()).toContain('подключён');
    const off = wrapper.find('.ym-head button');
    expect(off.text()).toBe('Отключить');

    disconnectMock.mockResolvedValue({ connected: false, message: 'отключена' });
    await off.trigger('click');
    await flushPromises();
    expect(disconnectMock).toHaveBeenCalledTimes(1);
    expect(wrapper.text()).toContain('не подключён');
  });

  it('истёкшая сессия → «Перезапросить код»', async () => {
    statusMock.mockResolvedValue({ status: 'expired', connected: false });
    const wrapper = mountCard();
    await flushPromises();

    expect(wrapper.text()).toContain('Время кода вышло');

    startMock.mockResolvedValue({ session_id: 's2', status: 'pending', verification_url: 'https://ya.ru/device', user_code: 'newcode' });
    await wrapper.find('.ym-card button.btn-primary').trigger('click');
    await flushPromises();
    expect(startMock).toHaveBeenCalledTimes(1);
    expect(wrapper.text()).toContain('newcode');
  });

  it('копирование кода шлёт текст в clipboard', async () => {
    statusMock.mockResolvedValue({ status: 'pending', connected: false, verification_url: 'https://ya.ru/device', user_code: 'sjh6tud4' });
    const wrapper = mountCard();
    await flushPromises();

    await wrapper.find('button[aria-label="скопировать код"]').trigger('click');
    await flushPromises();

    expect(writeText).toHaveBeenCalledWith('sjh6tud4');
  });

  it('сбой первого refresh → «Повторить» дёргает статус снова', async () => {
    statusMock.mockRejectedValueOnce(new Error('network'));
    const wrapper = mountCard();
    await flushPromises();
    expect(wrapper.text()).toContain('не удалось загрузить');

    statusMock.mockResolvedValue({ status: 'connected', connected: true, message: 'ок' });
    await wrapper.find('.ym-card button.btn-ghost').trigger('click');
    await flushPromises();
    expect(statusMock).toHaveBeenCalledTimes(2);
    expect(wrapper.text()).toContain('подключён');
  });
});
