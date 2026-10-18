<template>
  <ion-page>
    <ion-content :fullscreen="true" class="auth-content">
      <div class="auth-layout">
        <router-link to="/home" class="brand">
          <span class="brand-icon">S</span>
          <span>Sky<span class="brand-light">Fi</span></span>
        </router-link>

        <div class="auth-card">
          <div class="eyebrow">ТВОЁ МУЗЫКАЛЬНОЕ ПРОСТРАНСТВО</div>

          <h1>Создай аккаунт</h1>

          <p class="subtitle">
            Присоединяйся к SkyFi и собирай свою музыкальную коллекцию.
          </p>

          <form @submit.prevent="submit">
            <label for="name">Имя</label>

            <input
                id="name"
                v-model.trim="name"
                type="text"
                placeholder="Как тебя зовут?"
                autocomplete="name"
                maxlength="100"
                required
            />

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
                placeholder="Минимум 8 символов"
                autocomplete="new-password"
                minlength="8"
                required
            />

            <label for="password-confirmation">
              Подтверждение пароля
            </label>

            <input
                id="password-confirmation"
                v-model="passwordConfirmation"
                type="password"
                placeholder="Повтори пароль"
                autocomplete="new-password"
                minlength="8"
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
                    ? 'Создаём аккаунт...'
                    : 'Зарегистрироваться'
              }}
            </button>
          </form>

          <div class="auth-footer">
            Уже есть аккаунт?
            <router-link to="/login">
              Войти
            </router-link>
          </div>
        </div>

        <div class="auth-caption">
          SKYFI · SOUND OF YOUR WORLD
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

const router = useRouter();
const auth = useAuthStore();

const name = ref('');
const email = ref('');
const password = ref('');
const passwordConfirmation = ref('');

async function submit() {
  if (password.value !== passwordConfirmation.value) {
    auth.error = 'Пароли не совпадают.';
    return;
  }

  const success = await auth.register(
      name.value,
      email.value,
      password.value,
      passwordConfirmation.value,
  );

  if (success) {
    await router.replace('/home');
  }
}
</script>

<style scoped>
@import './auth.css';
</style>
