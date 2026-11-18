<template>
  <div class="sky-shell">
    <div class="sky-body">
      <div class="auth-brand">
        <div class="lockup">
          <svg class="mark" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <path d="M4.2 10.6a8.4 8.4 0 0 1 15.6 0" />
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

      <form v-if="mode === 'login'" class="auth-form" @submit.prevent="submitLogin">
        <label>Email</label>
        <div class="field"><input v-model="email" type="email" /></div>
        <label>Пароль</label>
        <div class="field"><input v-model="password" type="password" placeholder="••••••••" /></div>
        <button class="btn btn-primary" type="submit" style="width:100%;justify-content:center;margin-top:8px">Войти</button>
        <button class="btn btn-ghost" type="button" style="width:100%;justify-content:center" @click="mode = 'qr'">
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
        Нет аккаунта? <button class="link" type="button" @click="mode = 'register'">Создать</button><br>
        <button class="link" type="button" @click="mode = 'forgot'">забыл пароль</button>
      </div>

      <form v-else-if="mode === 'register'" class="auth-form" @submit.prevent="submitRegister">
        <label>Имя</label>
        <div class="field"><input v-model="name" placeholder="как к вам обращаться" /></div>
        <label>Email</label>
        <div class="field"><input v-model="email" type="email" /></div>
        <label>Пароль</label>
        <div class="field"><input v-model="password" type="password" placeholder="минимум 8" /></div>
        <button class="btn btn-primary" type="submit" style="width:100%;justify-content:center;margin-top:8px">Создать</button>
      </form>
      <div v-if="mode === 'register'" class="auth-links">
        Уже есть? <button class="link" type="button" @click="mode = 'login'">Войти</button>
      </div>

      <form v-else-if="mode === 'forgot'" class="auth-form" @submit.prevent="sendCode">
        <label>Email</label>
        <div class="field is-focus"><input v-model="email" type="email" /></div>
        <button class="btn btn-primary" type="submit" style="width:100%;justify-content:center;margin-top:8px">Отправить код</button>
      </form>
      <div v-if="mode === 'forgot'" class="auth-links">
        <button class="link" type="button" @click="mode = 'login'">Назад ко входу</button>
      </div>

      <form v-else-if="mode === 'reset'" class="auth-form" @submit.prevent="resetPassword">
        <div class="ym-code is-input">
          <div class="track-meta">
            <div class="l">Код из письма</div>
            <div class="n">{{ code }}<span class="caret" /></div>
          </div>
        </div>
        <label>Новый пароль</label>
        <div class="field"><input type="password" placeholder="минимум 8" /></div>
        <label>Ещё раз</label>
        <div class="field"><input type="password" placeholder="••••••••" /></div>
        <button class="btn btn-primary" type="submit" style="width:100%;justify-content:center;margin-top:8px">Сменить пароль</button>
      </form>

      <template v-else-if="mode === 'qr'">
        <div class="qr-box"><div class="qr-fake" /></div>
        <div class="empty" style="padding-top:8px">
          <div class="es">На другом устройстве откройте SkyFi и наведите камеру.</div>
        </div>
        <div class="auth-links">
          <button class="link" type="button" @click="mode = 'login'">Войти по email</button>
        </div>
      </template>
    </div>
  </div>
</template>

<script src="./Login.ts" lang="ts"></script>
