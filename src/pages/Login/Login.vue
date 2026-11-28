<template>
  <div class="sky-shell">
    <div class="sky-body">
      <div class="auth-brand">
        <div class="lockup">
          <svg class="mark" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <path d="M4.2 10.6a8.4 8.4 0 0 1 15.6 0" stroke-linecap="butt" />
            <path d="M9 12.4v8.1l7.7-4.05z" fill="currentColor" stroke="none" />
          </svg>
          <div class="word">Sky<b>Fi</b></div>
        </div>
        <div class="hero-sub">
          <template v-if="mode === 'login'">с возвращением</template>
          <template v-else-if="mode === 'register'">новый аккаунт</template>
          <template v-else-if="mode === 'forgot'">сброс пароля</template>
          <template v-else-if="mode === 'reset'">новый пароль</template>
          <template v-else>войти по QR</template>
        </div>
      </div>

      <div v-if="isOffline" class="auth-offline">
        <span>Нет соединения с сервером</span>
        <button class="link" type="button" @click="retry">Повторить</button>
      </div>

      <form v-if="mode === 'login'" class="auth-form" @submit.prevent="submitLogin">
        <label>Email</label>
        <div class="field" :class="{ 'is-error': fieldMessage('email') }">
          <input v-model="email" type="email" autocomplete="email" />
        </div>
        <div v-if="fieldMessage('email')" class="field-err">{{ fieldMessage('email') }}</div>
        <label>Пароль</label>
        <div class="field" :class="{ 'is-error': fieldMessage('password') }">
          <input v-model="password" :type="showPassword ? 'text' : 'password'" autocomplete="current-password" placeholder="••••••••" />
          <button
            class="field-eye"
            type="button"
            :aria-label="showPassword ? 'скрыть пароль' : 'показать пароль'"
            @click="showPassword = !showPassword"
          >
            <template v-if="!showPassword"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
              <circle cx="12" cy="12" r="3" />
            </svg></template>
            <template v-else><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <path d="M4 4l16 16" />
              <path d="M9.9 5.9A9.4 9.4 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a17 17 0 0 1-3.1 3.9M6.1 8.1A16 16 0 0 0 2.5 12S6 18.5 12 18.5a9.3 9.3 0 0 0 3.9-.9" />
              <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
            </svg></template>
          </button>
        </div>
        <div v-if="fieldMessage('password')" class="field-err">{{ fieldMessage('password') }}</div>
        <button class="btn btn-primary" type="submit" :disabled="pending || isOffline" style="width:100%;justify-content:center;margin-top:8px">
          {{ pending ? 'Входим…' : 'Войти' }}
        </button>
        <button class="btn btn-ghost" type="button" @click="switchMode('qr')">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
            <rect x="3" y="3" width="7" height="7" rx="1" />
            <rect x="14" y="3" width="7" height="7" rx="1" />
            <rect x="3" y="14" width="7" height="7" rx="1" />
            <path d="M14 14h3v3h4v4h-7z" />
          </svg>
          Войти по QR
        </button>
      </form>
      <div v-if="mode === 'login'" class="auth-links">
        Нет аккаунта? <button class="link" type="button" @click="switchMode('register')">Создать</button><br>
        <button class="link" type="button" @click="switchMode('forgot')">забыл пароль</button>
      </div>

      <form v-else-if="mode === 'register'" class="auth-form" @submit.prevent="submitRegister">
        <label>Имя</label>
        <div class="field" :class="{ 'is-error': fieldMessage('name') }">
          <input v-model="name" placeholder="как к вам обращаться" autocomplete="name" />
        </div>
        <div v-if="fieldMessage('name')" class="field-err">{{ fieldMessage('name') }}</div>
        <label>Email</label>
        <div class="field" :class="{ 'is-error': fieldMessage('email') }">
          <input v-model="email" type="email" autocomplete="email" />
        </div>
        <div v-if="fieldMessage('email')" class="field-err">{{ fieldMessage('email') }}</div>
        <label>Пароль</label>
        <div class="field" :class="{ 'is-error': fieldMessage('password') }">
          <input v-model="password" :type="showPassword ? 'text' : 'password'" autocomplete="new-password" placeholder="минимум 8" />
          <button
            class="field-eye"
            type="button"
            :aria-label="showPassword ? 'скрыть пароль' : 'показать пароль'"
            @click="showPassword = !showPassword"
          >
            <template v-if="!showPassword"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
              <circle cx="12" cy="12" r="3" />
            </svg></template>
            <template v-else><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <path d="M4 4l16 16" />
              <path d="M9.9 5.9A9.4 9.4 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a17 17 0 0 1-3.1 3.9M6.1 8.1A16 16 0 0 0 2.5 12S6 18.5 12 18.5a9.3 9.3 0 0 0 3.9-.9" />
              <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
            </svg></template>
          </button>
        </div>
        <div v-if="fieldMessage('password')" class="field-err">{{ fieldMessage('password') }}</div>
        <label>Ещё раз</label>
        <div class="field" :class="{ 'is-error': fieldMessage('password_confirmation') }">
          <input v-model="passwordConfirmation" :type="showPasswordConfirmation ? 'text' : 'password'" autocomplete="new-password" placeholder="••••••••" />
          <button
            class="field-eye"
            type="button"
            :aria-label="showPasswordConfirmation ? 'скрыть пароль' : 'показать пароль'"
            @click="showPasswordConfirmation = !showPasswordConfirmation"
          >
            <template v-if="!showPasswordConfirmation"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
              <circle cx="12" cy="12" r="3" />
            </svg></template>
            <template v-else><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <path d="M4 4l16 16" />
              <path d="M9.9 5.9A9.4 9.4 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a17 17 0 0 1-3.1 3.9M6.1 8.1A16 16 0 0 0 2.5 12S6 18.5 12 18.5a9.3 9.3 0 0 0 3.9-.9" />
              <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
            </svg></template>
          </button>
        </div>
        <div v-if="fieldMessage('password_confirmation')" class="field-err">{{ fieldMessage('password_confirmation') }}</div>
        <button class="btn btn-primary" type="submit" :disabled="pending || isOffline" style="width:100%;justify-content:center;margin-top:8px">
          {{ pending ? 'Создаём…' : 'Создать' }}
        </button>
      </form>
      <div v-if="mode === 'register'" class="auth-links">
        Уже есть? <button class="link" type="button" @click="switchMode('login')">Войти</button>
      </div>

      <form v-else-if="mode === 'forgot'" class="auth-form" @submit.prevent="sendCode">
        <label>Email</label>
        <div class="field" :class="{ 'is-error': fieldMessage('email') }">
          <input v-model="email" type="email" autocomplete="email" />
        </div>
        <div v-if="fieldMessage('email')" class="field-err">{{ fieldMessage('email') }}</div>
        <button class="btn btn-primary" type="submit" :disabled="pending || isOffline" style="width:100%;justify-content:center;margin-top:8px">
          {{ pending ? 'Отправляем…' : 'Отправить код' }}
        </button>
      </form>
      <div v-if="mode === 'forgot'" class="auth-links">
        <button class="link" type="button" @click="switchMode('login')">Назад ко входу</button>
      </div>

      <form v-else-if="mode === 'reset'" class="auth-form" @submit.prevent="submitReset">
        <div class="reset-hint">Код отправлен на <b>{{ resetEmail }}</b></div>
        <label>Код из письма</label>
        <div class="field" :class="{ 'is-error': fieldMessage('code') }">
          <input v-model="code" inputmode="numeric" autocomplete="one-time-code" placeholder="цифры из письма" />
        </div>
        <div v-if="fieldMessage('code')" class="field-err">{{ fieldMessage('code') }}</div>
        <label>Новый пароль</label>
        <div class="field" :class="{ 'is-error': fieldMessage('password') }">
          <input v-model="password" :type="showPassword ? 'text' : 'password'" autocomplete="new-password" placeholder="минимум 8" />
          <button
            class="field-eye"
            type="button"
            :aria-label="showPassword ? 'скрыть пароль' : 'показать пароль'"
            @click="showPassword = !showPassword"
          >
            <template v-if="!showPassword"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
              <circle cx="12" cy="12" r="3" />
            </svg></template>
            <template v-else><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <path d="M4 4l16 16" />
              <path d="M9.9 5.9A9.4 9.4 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a17 17 0 0 1-3.1 3.9M6.1 8.1A16 16 0 0 0 2.5 12S6 18.5 12 18.5a9.3 9.3 0 0 0 3.9-.9" />
              <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
            </svg></template>
          </button>
        </div>
        <div v-if="fieldMessage('password')" class="field-err">{{ fieldMessage('password') }}</div>
        <label>Ещё раз</label>
        <div class="field" :class="{ 'is-error': fieldMessage('password_confirmation') }">
          <input v-model="passwordConfirmation" :type="showPasswordConfirmation ? 'text' : 'password'" autocomplete="new-password" placeholder="••••••••" />
          <button
            class="field-eye"
            type="button"
            :aria-label="showPasswordConfirmation ? 'скрыть пароль' : 'показать пароль'"
            @click="showPasswordConfirmation = !showPasswordConfirmation"
          >
            <template v-if="!showPasswordConfirmation"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
              <circle cx="12" cy="12" r="3" />
            </svg></template>
            <template v-else><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <path d="M4 4l16 16" />
              <path d="M9.9 5.9A9.4 9.4 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a17 17 0 0 1-3.1 3.9M6.1 8.1A16 16 0 0 0 2.5 12S6 18.5 12 18.5a9.3 9.3 0 0 0 3.9-.9" />
              <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
            </svg></template>
          </button>
        </div>
        <div v-if="fieldMessage('password_confirmation')" class="field-err">{{ fieldMessage('password_confirmation') }}</div>
        <button class="btn btn-primary" type="submit" :disabled="pending || isOffline" style="width:100%;justify-content:center;margin-top:8px">
          {{ pending ? 'Меняем…' : 'Сменить пароль' }}
        </button>
      </form>

      <template v-else-if="mode === 'qr'">
        <div v-if="qrPhase === 'starting'" class="empty" style="padding-top:24px">
          <div class="es">Получаем код…</div>
        </div>
        <div v-else-if="qrPhase === 'polling' && qrSvg" class="qr-box" v-html="qrSvg" />
        <div v-if="qrPhase === 'expired'" class="empty" style="padding-top:8px">
          <div class="es">Код устарел — запросите новый.</div>
          <button class="btn btn-primary" type="button" style="width:100%;justify-content:center;margin-top:12px" @click="startQr">
            Обновить QR
          </button>
        </div>
        <div v-else-if="qrPhase === 'polling'" class="empty" style="padding-top:8px">
          <div class="es">На другом устройстве откройте SkyFi и наведите камеру.</div>
        </div>
        <div class="auth-links">
          <button class="link" type="button" @click="switchMode('login')">Войти по email</button>
        </div>
      </template>
    </div>
  </div>
</template>

<script src="./Login.ts" lang="ts"></script>

<style scoped src="./Login.css"></style>
