
<template>
  <section class="ym-auth">
    <div class="ym-auth__header">
      <div class="ym-auth__logo" aria-hidden="true">♫</div>

      <div class="ym-auth__heading">
        <h2>Яндекс Музыка</h2>
        <p>Подключи аккаунт, чтобы искать и слушать музыку</p>
      </div>

      <span
          class="ym-auth__status"
          :class="connected ? 'is-connected' : 'is-disconnected'"
      >
        <span class="ym-auth__status-dot"></span>
        {{ connected ? 'Подключено' : 'Не подключено' }}
      </span>
    </div>

    <div v-if="connected" class="ym-auth__connected">
      <div class="ym-auth__success-icon" aria-hidden="true">✓</div>

      <div class="ym-auth__connected-info">
        <strong>Аккаунт успешно подключён</strong>
        <p>Можно искать треки и запускать воспроизведение.</p>
      </div>

      <button
          type="button"
          class="ym-auth__disconnect"
          :disabled="loading"
          @click="disconnect"
      >
        {{ loading ? 'Отключение…' : 'Отключить' }}
      </button>
    </div>

    <div v-else class="ym-auth__device">
      <template v-if="!authStarted">
        <p class="ym-auth__description">
          Подключи аккаунт через страницу подтверждения Яндекса.
          Пароль и токен вводить в SkyFi не нужно.
        </p>

        <button
            type="button"
            class="ym-auth__submit"
            :disabled="loading"
            @click="startAuth"
        >
          <span v-if="loading" class="ym-auth__spinner"></span>
          {{ loading ? 'Подготавливаем авторизацию…' : 'Подключить Яндекс Музыку' }}
        </button>
      </template>

      <template v-else>
        <div class="ym-auth__message ym-auth__message--info" role="status">
          <span class="ym-auth__spinner"></span>
          <span>
            {{ verificationUrl
              ? 'Открой страницу Яндекса и подтверди вход.'
              : 'Получаем код подтверждения…' }}
          </span>
        </div>

        <div v-if="userCode" class="ym-auth__code">
          <span class="ym-auth__code-label">Код подтверждения</span>
          <strong>{{ userCode }}</strong>
          <button
              type="button"
              class="ym-auth__copy"
              @click="copyCode"
          >
            {{ copied ? 'Скопировано' : 'Копировать код' }}
          </button>
        </div>

        <a
            v-if="verificationUrl"
            class="ym-auth__submit ym-auth__link"
            :href="verificationUrl"
            target="_blank"
            rel="noopener noreferrer"
        >
          Открыть страницу Яндекса
          <span aria-hidden="true">↗</span>
        </a>

        <p class="ym-auth__hint">
          После подтверждения на странице Яндекса подключение завершится
          автоматически. Не закрывай эту панель до завершения процесса.
        </p>

        <button
            type="button"
            class="ym-auth__cancel"
            :disabled="loading"
            @click="cancelAuth"
        >
          Отменить
        </button>
      </template>
    </div>

    <div
        v-if="error"
        class="ym-auth__message ym-auth__message--error"
        role="alert"
    >
      {{ error }}
    </div>

    <div
        v-if="successMessage"
        class="ym-auth__message ym-auth__message--success"
        role="status"
    >
      {{ successMessage }}
    </div>

    <p class="ym-auth__footer">
      Авторизация выполняется через защищённый backend API приложения.
    </p>
  </section>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';
import {
  startYandexMusicDeviceAuth,
  getYandexMusicDeviceAuthStatus,
  disconnectYandexMusic,
} from '@/api/auth';

const emit = defineEmits<{
  connected: [];
  disconnected: [];
}>();

const connected = ref(false);
const loading = ref(false);
const authStarted = ref(false);
const verificationUrl = ref('');
const userCode = ref('');
const error = ref('');
const successMessage = ref('');
const copied = ref(false);

let pollTimer: ReturnType<typeof setTimeout> | undefined;
let disposed = false;
let polling = false;
let generation = 0;

onMounted(() => {
  void checkExistingConnection();
});

async function checkExistingConnection(): Promise<void> {
  try {
    const result = await getYandexMusicDeviceAuthStatus();

    if (disposed) return;

    if (result.connected || result.status === 'connected') {
      connected.value = true;
      emit('connected');
      return;
    }

    if (result.status === 'pending' || result.status === 'completed') {
      authStarted.value = true;
      verificationUrl.value = result.verification_url ?? '';
      userCode.value = result.user_code ?? '';
      schedulePoll();
    }
  } catch {
    // Не блокируем компонент, если проверка статуса временно недоступна.
  }
}

async function startAuth(): Promise<void> {
  if (loading.value || disposed) return;

  loading.value = true;
  error.value = '';
  successMessage.value = '';
  const currentGeneration = ++generation;

  try {
    const result = await startYandexMusicDeviceAuth();

    if (disposed || currentGeneration !== generation) return;

    authStarted.value = true;
    verificationUrl.value = result.verification_url ?? '';
    userCode.value = result.user_code ?? '';

    schedulePoll();
  } catch (e: unknown) {
    if (!disposed && currentGeneration === generation) {
      error.value = getErrorMessage(e);
    }
  } finally {
    if (!disposed && currentGeneration === generation) {
      loading.value = false;
    }
  }
}

function schedulePoll(): void {
  if (disposed || !authStarted.value || connected.value) return;

  if (pollTimer) clearTimeout(pollTimer);

  pollTimer = setTimeout(() => {
    void pollStatus();
  }, 2000);
}

async function pollStatus(): Promise<void> {
  if (disposed || polling || !authStarted.value) return;

  polling = true;

  try {
    const result = await getYandexMusicDeviceAuthStatus();

    if (disposed) return;

    if (result.verification_url) {
      verificationUrl.value = result.verification_url;
    }

    if (result.user_code) {
      userCode.value = result.user_code;
    }

    if (result.connected || result.status === 'connected') {
      connected.value = true;
      authStarted.value = false;
      successMessage.value = 'Яндекс Музыка успешно подключена.';
      emit('connected');
      return;
    }

    if (['failed', 'expired', 'not_started', 'consumed'].includes(result.status)) {
      authStarted.value = false;

      if (result.status === 'failed') {
        error.value = 'Не удалось завершить авторизацию. Попробуй ещё раз.';
      } else if (result.status === 'expired') {
        error.value = 'Время подтверждения истекло. Запусти авторизацию заново.';
      } else if (result.status === 'consumed') {
        error.value = 'Сессия авторизации уже использована. Запусти её заново.';
      }

      return;
    }
  } catch (e: unknown) {
    if (disposed) return;

    // Временная ошибка сети не сбрасывает сессию.
    error.value = getErrorMessage(e);
  } finally {
    polling = false;
  }

  schedulePoll();
}

async function copyCode(): Promise<void> {
  if (!userCode.value) return;

  try {
    await navigator.clipboard.writeText(userCode.value);
    copied.value = true;

    setTimeout(() => {
      copied.value = false;
    }, 2000);
  } catch {
    error.value = 'Не удалось скопировать код. Выдели его и скопируй вручную.';
  }
}

function cancelAuth(): void {
  generation++;

  if (pollTimer) {
    clearTimeout(pollTimer);
    pollTimer = undefined;
  }

  // В текущем backend нет отдельного маршрута отмены Python-сессии.
  // Здесь останавливаем опрос, но серверная сессия может жить до TTL.
  authStarted.value = false;
  verificationUrl.value = '';
  userCode.value = '';
  error.value = '';
  copied.value = false;
}

async function disconnect(): Promise<void> {
  if (loading.value || disposed) return;

  loading.value = true;
  error.value = '';
  successMessage.value = '';

  try {
    await disconnectYandexMusic();

    if (disposed) return;

    connected.value = false;
    authStarted.value = false;
    verificationUrl.value = '';
    userCode.value = '';
    emit('disconnected');
  } catch (e: unknown) {
    if (!disposed) {
      error.value = getErrorMessage(e);
    }
  } finally {
    if (!disposed) loading.value = false;
  }
}

function getErrorMessage(e: unknown): string {
  const response = (
      e as {
        response?: {
          status?: number;
          data?: { message?: string };
        };
        message?: string;
      }
  )?.response;

  if (!response) {
    return 'Не удалось связаться с сервером. Проверь соединение и попробуй снова.';
  }

  if (response.status === 401 || response.status === 403) {
    return 'Войди в SkyFi заново, чтобы продолжить.';
  }

  if (response.status === 429) {
    return 'Слишком много запросов. Подожди немного и попробуй снова.';
  }

  if (response.status !== undefined && response.status >= 500) {
    return response.data?.message
        || 'Ошибка сервера. Попробуй подключиться позже.';
  }

  return response.data?.message || 'Не удалось выполнить операцию.';
}

onBeforeUnmount(() => {
  disposed = true;
  generation++;

  if (pollTimer) {
    clearTimeout(pollTimer);
  }
});
</script>

<style scoped>
.ym-auth {
  width: 100%;
  max-width: 520px;
  padding: 24px;
  border: 1px solid var(--ion-color-step-150, #303030);
  border-radius: 20px;
  background: var(--ion-card-background, #181818);
  color: var(--ion-text-color, #fff);
  box-sizing: border-box;
}

.ym-auth__header {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-bottom: 28px;
}

.ym-auth__logo {
  display: grid;
  place-items: center;
  flex: 0 0 52px;
  width: 52px;
  height: 52px;
  border-radius: 15px;
  background: #ffdb4d;
  color: #171717;
  font-size: 30px;
}

.ym-auth__heading {
  flex: 1;
  min-width: 0;
}

.ym-auth__heading h2 {
  margin: 0 0 6px;
  font-size: 20px;
  font-weight: 700;
}

.ym-auth__heading p {
  margin: 0;
  color: var(--ion-color-medium, #aaa);
  font-size: 13px;
  line-height: 1.5;
}

.ym-auth__status {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  white-space: nowrap;
  font-size: 12px;
}

.ym-auth__status.is-connected {
  color: #4ade80;
}

.ym-auth__status.is-disconnected {
  color: var(--ion-color-medium, #aaa);
}

.ym-auth__status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: currentColor;
}

.ym-auth__description {
  margin: 0;
  color: var(--ion-color-medium, #aaa);
  font-size: 13px;
  line-height: 1.7;
}

.ym-auth__submit {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 10px;
  width: 100%;
  margin-top: 22px;
  padding: 15px;
  border: 0;
  border-radius: 11px;
  background: #ffdb4d;
  color: #171717;
  font-size: 14px;
  font-weight: 700;
  text-decoration: none;
  box-sizing: border-box;
  cursor: pointer;
  transition: opacity 0.2s ease, transform 0.2s ease;
}

.ym-auth__submit:hover:not(:disabled) {
  transform: translateY(-1px);
}

.ym-auth__submit:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.ym-auth__link {
  margin-top: 16px;
}

.ym-auth__spinner {
  display: inline-block;
  flex: 0 0 15px;
  width: 15px;
  height: 15px;
  border: 2px solid rgb(23 23 23 / 30%);
  border-top-color: #171717;
  border-radius: 50%;
  animation: ym-spin 0.7s linear infinite;
}

.ym-auth__message {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 14px;
  padding: 11px 13px;
  border-radius: 9px;
  font-size: 13px;
  line-height: 1.5;
}

.ym-auth__message--info {
  background: rgb(255 219 77 / 8%);
  color: var(--ion-text-color, #fff);
}

.ym-auth__message--error {
  background: rgb(255 80 80 / 10%);
  color: #ff7777;
}

.ym-auth__message--success {
  background: rgb(74 222 128 / 10%);
  color: #4ade80;
}

.ym-auth__code {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  margin-top: 20px;
  padding: 22px 16px;
  border: 1px solid var(--ion-color-step-250, #444);
  border-radius: 12px;
}

.ym-auth__code-label {
  color: var(--ion-color-medium, #aaa);
  font-size: 12px;
}

.ym-auth__code strong {
  font-size: 30px;
  letter-spacing: 5px;
}

.ym-auth__copy {
  padding: 8px 12px;
  border: 1px solid var(--ion-color-step-250, #444);
  border-radius: 9px;
  background: transparent;
  color: #ffdb4d;
  font-size: 12px;
  cursor: pointer;
}

.ym-auth__hint {
  margin: 14px 0 0;
  color: var(--ion-color-medium, #aaa);
  font-size: 12px;
  line-height: 1.6;
}

.ym-auth__cancel {
  display: block;
  margin: 14px auto 0;
  padding: 9px 12px;
  border: 0;
  background: transparent;
  color: var(--ion-color-medium, #aaa);
  font-size: 12px;
  cursor: pointer;
}

.ym-auth__cancel:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.ym-auth__connected {
  display: flex;
  align-items: center;
  gap: 13px;
  padding: 16px;
  border: 1px solid rgb(74 222 128 / 25%);
  border-radius: 12px;
  background: rgb(74 222 128 / 5%);
}

.ym-auth__success-icon {
  display: grid;
  place-items: center;
  flex: 0 0 34px;
  width: 34px;
  height: 34px;
  border-radius: 50%;
  background: #4ade80;
  color: #14251a;
  font-weight: 800;
}

.ym-auth__connected-info {
  flex: 1;
  min-width: 0;
}

.ym-auth__connected-info strong {
  font-size: 14px;
}

.ym-auth__connected-info p {
  margin: 5px 0 0;
  color: var(--ion-color-medium, #aaa);
  font-size: 12px;
  line-height: 1.5;
}

.ym-auth__disconnect {
  padding: 9px 12px;
  border: 1px solid var(--ion-color-step-250, #444);
  border-radius: 9px;
  background: transparent;
  color: inherit;
  font-size: 12px;
  cursor: pointer;
}

.ym-auth__disconnect:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.ym-auth__footer {
  margin: 20px 0 0;
  color: var(--ion-color-medium, #888);
  font-size: 11px;
  line-height: 1.5;
}

@keyframes ym-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 420px) {
  .ym-auth {
    padding: 18px;
  }

  .ym-auth__header {
    flex-wrap: wrap;
  }

  .ym-auth__status {
    width: 100%;
    margin-left: 66px;
  }

  .ym-auth__connected {
    flex-wrap: wrap;
  }

  .ym-auth__disconnect {
    margin-left: 47px;
  }
}
</style>
