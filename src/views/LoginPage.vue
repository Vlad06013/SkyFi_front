<template>
  <ion-page>
    <ion-content :fullscreen="true" class="auth-content">
      <div class="auth-layout">
        <router-link to="/home" class="brand">
          <span class="brand-icon">S</span>
          <span>Sky<span class="brand-light">Fi</span></span>
        </router-link>

        <div class="auth-card">
          <div class="eyebrow">РАДЫ ТЕБЯ ВИДЕТЬ</div>

          <h1>С возвращением</h1>

          <p class="subtitle">
            Войди в аккаунт и продолжай слушать любимую музыку.
          </p>

          <form @submit.prevent="submit">
            <label for="email">Email</label>

            <input
                id="email"
                v-model.trim="email"
                type="email"
                placeholder="you@example.com"
                autocomplete="email"
                required
            />

            <label for="password">Пароль</label>

            <input
                id="password"
                v-model="password"
                type="password"
                placeholder="Введи пароль"
                autocomplete="current-password"
                required
            />

            <div v-if="auth.error" class="error-message" role="alert">
              {{ auth.error }}
            </div>

            <button
                class="submit-button"
                type="submit"
                :disabled="auth.isLoading"
            >
              {{
                auth.isLoading
                    ? 'Входим...'
                    : 'Войти в аккаунт'
              }}
            </button>
          </form>

          <div class="auth-footer">
            Нет аккаунта?
            <router-link to="/register">
              Зарегистрироваться
            </router-link>
          </div>
        </div>

        <div class="auth-caption">
          SKYFI · ТВОЯ МУЗЫКА. ТВОЁ ПРОСТРАНСТВО.
        </div>
      </div>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { IonContent, IonPage } from '@ionic/vue';
import { useAuthStore } from '@/stores/auth';

import './auth.css';
const router = useRouter();
const auth = useAuthStore();

const email = ref('');
const password = ref('');

async function submit() {
  const success = await auth.login(
      email.value,
      password.value,
  );

  if (success) {
    const redirect = router.currentRoute.value.query.redirect;

    await router.replace(
        typeof redirect === 'string' && redirect.startsWith('/')
            ? redirect
            : '/home',
    );
  }
}
</script>

<style scoped>

</style>
