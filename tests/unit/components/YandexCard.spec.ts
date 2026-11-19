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
  fetchYandexImportSummary: vi.fn(),
  startYandexImport: vi.fn(),
  fetchYandexImportProgress: vi.fn(),
  cancelYandexImport: vi.fn(),
}));

const startMock = vi.mocked(yandexApi.startYandexDeviceAuth);
const statusMock = vi.mocked(yandexApi.fetchYandexDeviceStatus);
const disconnectMock = vi.mocked(yandexApi.disconnectYandex);
const summaryMock = vi.mocked(yandexApi.fetchYandexImportSummary);
const startImportMock = vi.mocked(yandexApi.startYandexImport);
const progressMock = vi.mocked(yandexApi.fetchYandexImportProgress);
const cancelImportMock = vi.mocked(yandexApi.cancelYandexImport);

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
    summaryMock.mockReset();
    startImportMock.mockReset();
    progressMock.mockReset();
    cancelImportMock.mockReset();
    // Импортные вызовы по умолчанию тихие и пустые.
    summaryMock.mockResolvedValue({
      tracks: { total: 1248, existing: 0 },
      videos: { total: 0, existing: 0 },
      albums: { total: 86, existing: 0 },
      playlists: { total: 12, existing: 0 },
      artists: { total: 41, existing: 0 },
    });
    progressMock.mockResolvedValue(null);
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

  it('подключён: рисует сводку лайкнутого (existing/total) и кнопку импорта', async () => {
    statusMock.mockResolvedValue({ status: 'connected', connected: true, message: 'ок' });
    summaryMock.mockResolvedValue({
      tracks: { total: 1248, existing: 5 },
      videos: { total: 0, existing: 0 },
      albums: { total: 86, existing: 2 },
      playlists: { total: 12, existing: 0 },
      artists: { total: 41, existing: 1 },
    });
    const wrapper = mountCard();
    await flushPromises();
    await vi.advanceTimersByTimeAsync(0);

    const text = wrapper.text();
    expect(text).toContain(`5/${(1248).toLocaleString('ru-RU')}`);
    expect(text).toContain('2/86');
    expect(text).toContain('0/12');
    expect(text).toContain('1/41');
    expect(text).toContain('Импортировать');
  });

  it('импорт: клик стартует джобу, поллинг доводит до «завершён»', async () => {
    statusMock.mockResolvedValue({ status: 'connected', connected: true, message: 'ок' });
    startImportMock.mockResolvedValue({
      job_id: 'j1', status: 'queued', total: 0, processed: 0, imported: 0, skipped: 0, failed: 0, progress: 0, message: null, started_at: null, finished_at: null,
    });
    const wrapper = mountCard();
    await flushPromises();
    await vi.advanceTimersByTimeAsync(0);

    await wrapper.find('.ym-card button.btn-primary').trigger('click');
    await flushPromises();
    expect(startImportMock).toHaveBeenCalledTimes(1);
    expect(wrapper.text()).toContain('Отменить');

    progressMock.mockResolvedValue({
      job_id: 'j1', status: 'running', total: 100, processed: 50, imported: 50, skipped: 0, failed: 0, progress: 50, message: null, started_at: 't', finished_at: null,
    });
    await vi.advanceTimersByTimeAsync(3_000);
    await flushPromises();
    expect(wrapper.text()).toContain('50%');

    progressMock.mockResolvedValue({
      job_id: 'j1', status: 'completed', total: 100, processed: 100, imported: 90, skipped: 10, failed: 0, progress: 100, message: null, started_at: 't', finished_at: 't',
    });
    await vi.advanceTimersByTimeAsync(3_000);
    await flushPromises();

    const text = wrapper.text();
    expect(text).toContain('Импорт завершён · добавлено 90 · пропущено 10');
    expect(text).toContain('Импортировать снова');
  });

  it('отмена импорта зовёт DELETE и возвращает кнопку импорта', async () => {
    statusMock.mockResolvedValue({ status: 'connected', connected: true, message: 'ок' });
    startImportMock.mockResolvedValue({
      job_id: 'j1', status: 'running', total: 100, processed: 40, imported: 40, skipped: 0, failed: 0, progress: 40, message: null, started_at: 't', finished_at: null,
    });
    cancelImportMock.mockResolvedValue({
      job_id: 'j1', status: 'cancelled', total: 100, processed: 40, imported: 40, skipped: 0, failed: 0, progress: 40, message: 'Импорт отменён', started_at: 't', finished_at: 't',
    });
    const wrapper = mountCard();
    await flushPromises();
    await vi.advanceTimersByTimeAsync(0);

    await wrapper.find('.ym-card button.btn-primary').trigger('click');
    await flushPromises();
    // «Отменить» — широкая ghost-кнопка под прогрессом (в шапке своя ghost — «Отключить»).
    await wrapper.find('.ym-card button.btn-ghost.wide').trigger('click');
    await flushPromises();

    expect(cancelImportMock).toHaveBeenCalledTimes(1);
    expect(wrapper.text()).toContain('Импорт отменён');
    expect(wrapper.text()).toContain('Импортировать');
  });

  it('провал джобы показывает сообщение и оставляет кнопку повтора', async () => {
    statusMock.mockResolvedValue({ status: 'connected', connected: true, message: 'ок' });
    progressMock.mockResolvedValue({
      job_id: 'j1', status: 'failed', total: 100, processed: 10, imported: 10, skipped: 0, failed: 0, progress: 10, message: 'Сервис Яндекс Музыки вернул ошибку.', started_at: 't', finished_at: 't',
    });
    const wrapper = mountCard();
    await flushPromises();
    await vi.advanceTimersByTimeAsync(0);

    expect(wrapper.text()).toContain('Сервис Яндекс Музыки вернул ошибку.');
    expect(wrapper.text()).toContain('Импортировать');
  });
});
