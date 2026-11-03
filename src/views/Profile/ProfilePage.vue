
<template>
  <ion-page>
    <ion-content :fullscreen="true" class="skyfi-content">
      <!-- Структура контента как на главной странице -->
      <div class="main-area">
        <div class="page-content">
          <div class="profile-layout">
            <header class="profile-heading">
              <div class="profile-heading-copy">
                <div class="eyebrow">
                  ЛИЧНОЕ ПРОСТРАНСТВО
                </div>

                <h1>Мой профиль</h1>

                <p>
                  Управляй своим аккаунтом и подключёнными музыкальными сервисами.
                </p>
              </div>

              <div class="heading-actions">
                <ProfileMenu />
              </div>
            </header>

            <!-- Информация о пользователе -->
            <section class="profile-card">
              <div class="profile-avatar">
                {{ userInitial }}
              </div>

              <div class="profile-user-info">
                <span class="profile-overline">АККАУНТ SKYFI</span>

                <h2>{{ user?.name || 'Пользователь' }}</h2>

                <p>{{ user?.email || 'Email не указан' }}</p>
              </div>
            </section>

            <!-- Подключённые сервисы -->
            <section class="services-section">
              <div class="section-heading">
                <div>
                  <div class="eyebrow">ИНТЕГРАЦИИ</div>
                  <h2>Музыкальные сервисы</h2>
                </div>
              </div>

              <div class="service-card">
                <div class="service-heading">
                  <div class="yandex-icon">Я</div>

                  <div class="service-title">
                    <h3>Яндекс Музыка</h3>
                    <p>
                      Поиск треков и воспроизведение музыки
                    </p>
                  </div>
                </div>

                <div class="service-auth">
                  <YandexMusicAuth
                      @connected="onYandexConnected"
                      @disconnected="onYandexDisconnected"
                  />
                  <YandexMusicImport
                      :connected="yandexConnected"
                      @open-library="goToLibrary"
                  />
                </div>
              </div>
            </section>

            <!-- Скачивание приложения -->
            <section class="app-download">
              <div class="app-download-info">
                <div class="eyebrow">ANDROID</div>

                <h2>Приложение SkyFi</h2>

                <p>
                  Актуальная версия для телефона и телевизора.
                  Скачай APK и открой его, чтобы установить.
                </p>
              </div>

              <a
                  class="download-button"
                  :href="APK_DOWNLOAD_URL"
                  target="_blank"
                  rel="noopener"
              >
                ↓ Скачать APK
              </a>
            </section>
          </div>
        </div>
      </div>
    </ion-content>

    <AppNavigation />
  </ion-page>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import { IonPage, IonContent } from '@ionic/vue';

import YandexMusicImport from '@/components/Auth/YandexMusic/YandexMusicImport.vue';
import YandexMusicAuth from '@/components/Auth/YandexMusic/YandexMusicAuth.vue';
import AppNavigation from '@/components/AppNavigation.vue';
import ProfileMenu from '@/components/profile/ProfileMenu.vue';
import { useAuthStore } from '@/stores/auth';

const router = useRouter();
const auth = useAuthStore();

const user = computed(() => auth.user);

const userInitial = computed(() => {
  return user.value?.name?.trim().charAt(0).toUpperCase() || 'U';
});

const yandexConnected = ref(false);

/*
 * Прямая ссылка на APK в публичном репозитории (ветка dev).
 * raw.githubusercontent отдаёт файл как вложение: браузер скачает
 * его, а не попытается открыть внутри страницы. В приложении
 * внешние адреса уходят в системный браузер (как и скачивание
 * треков) — тот и сохранит APK.
 */
const APK_DOWNLOAD_URL =
    'https://raw.githubusercontent.com/Vlad06013/SkyFi_front/dev/skyFy.apk';

function onYandexConnected(): void {
  yandexConnected.value = true;
}

function onYandexDisconnected(): void {
  yandexConnected.value = false;
}

function goToLibrary(): void {
  void router.push('/library');
}
</script>

<style scoped>
.skyfi-content {
  --background: #0b0c12;
  color: #f4f4fa;
}

/*
 * Повторяем структуру главной страницы:
 * sidebar = 228px;
 * main-area занимает оставшуюся ширину.
 */
.main-area {
  box-sizing: border-box;
  min-width: 0;
  width: auto;
}

.page-content {
  box-sizing: border-box;
  width: 100%;
  max-width: 1500px;
  min-width: 0;
  margin: 0 auto;
  padding: 36px 4.5% 150px;
}

.profile-layout {
  box-sizing: border-box;
  width: 100%;
  max-width: none;
  min-width: 0;
  margin: 0;
  padding: 0;
  color: #f4f4fa;
  overflow-wrap: anywhere;
}

.profile-heading,
.profile-card,
.services-section,
.service-card,
.app-download {
  box-sizing: border-box;
  min-width: 0;
  max-width: 100%;
}

.profile-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 20px;
  margin-bottom: 32px;
}

.profile-heading-copy {
  flex: 1 1 300px;
  min-width: 0;
}

.eyebrow,
.profile-overline {
  color: #9295a8;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 1.8px;
}

.profile-heading h1 {
  margin: 12px 0;
  color: #fff;
  font-size: clamp(30px, 3.2vw, 42px);
  line-height: 1.15;
  letter-spacing: -1.5px;
  overflow-wrap: anywhere;
}

.profile-heading p {
  max-width: 540px;
  margin: 0;
  color: #a7a4b3;
  font-size: 13px;
  line-height: 1.7;
}

.heading-actions {
  display: flex;
  align-items: center;
  gap: 14px;
  flex-shrink: 0;
}

.profile-card,
.service-card {
  width: 100%;
  border: 1px solid #292633;
  border-radius: 20px;
  background: linear-gradient(135deg, #191721, #111117);
}

.profile-card {
  display: flex;
  align-items: center;
  gap: 20px;
  padding: 26px;
}

.profile-avatar {
  display: grid;
  place-items: center;
  flex: 0 0 72px;
  width: 72px;
  height: 72px;
  border-radius: 22px;
  background: linear-gradient(135deg, #9274f6, #5741b7);
  color: #fff;
  font-size: 30px;
  font-weight: 700;
}

.profile-user-info {
  flex: 1;
  min-width: 0;
}

.profile-user-info h2 {
  margin: 8px 0;
  color: #f5f3fa;
  font-size: 23px;
  overflow-wrap: anywhere;
}

.profile-user-info p {
  margin: 0;
  color: #aaa6b7;
  overflow-wrap: anywhere;
}

.services-section {
  width: 100%;
  margin-top: 42px;
}

.section-heading {
  display: flex;
  align-items: end;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 20px;
}

.section-heading h2 {
  margin: 10px 0 0;
  color: #f3f2f9;
  font-size: clamp(20px, 2vw, 25px);
  letter-spacing: -0.5px;
  overflow-wrap: anywhere;
}

.service-card {
  padding: 24px;
}

.service-heading {
  display: flex;
  align-items: center;
  gap: 15px;
  min-width: 0;
  margin-bottom: 24px;
}

.yandex-icon {
  display: grid;
  place-items: center;
  flex: 0 0 52px;
  width: 52px;
  height: 52px;
  border-radius: 16px;
  background: #ffdb4d;
  color: #191919;
  font-size: 29px;
  font-weight: 800;
}

.service-title {
  min-width: 0;
}

.service-title h3 {
  margin: 0 0 7px;
  color: #f5f3fa;
  font-size: 19px;
  overflow-wrap: anywhere;
}

.service-title p {
  margin: 0;
  color: #aaa6b7;
  font-size: 13px;
  line-height: 1.6;
}

.service-auth {
  box-sizing: border-box;
  width: 100%;
  min-width: 0;
  max-width: 100%;
  padding-top: 20px;
  border-top: 1px solid #302d3c;
  overflow-wrap: anywhere;
}

/* Подгоняем форму авторизации под карточку профиля */
.service-auth :deep(.ym-auth) {
  box-sizing: border-box;
  width: 100%;
  min-width: 0;
  max-width: 100%;
  padding: 0;
  border: 0;
  border-radius: 0;
  background: transparent;
}

.service-auth :deep(.ym-auth__header),
.service-auth :deep(.ym-auth__footer) {
  display: none;
}

.service-auth :deep(.ym-auth__input-wrap) {
  box-sizing: border-box;
  width: 100%;
  min-width: 0;
  max-width: 100%;
}

.service-auth :deep(.ym-auth__input-wrap input) {
  box-sizing: border-box;
  width: 100%;
  min-width: 0;
  max-width: 100%;
}

.service-auth :deep(.ym-auth__submit) {
  box-sizing: border-box;
  max-width: 100%;
}

.app-download {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  width: 100%;
  margin-top: 22px;
  padding: 20px 22px;
  border: 1px solid #292633;
  border-radius: 14px;
  background: linear-gradient(135deg, #191721, #111117);
}

.app-download-info {
  min-width: 0;
}

.app-download-info .eyebrow {
  margin-bottom: 8px;
  color: #a78bfa;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 2px;
}

.app-download-info h2 {
  margin: 0;
  color: #f5f7fa;
  font-size: 19px;
  font-weight: 750;
  letter-spacing: -0.4px;
}

.app-download-info p {
  margin: 8px 0 0;
  color: #9296a7;
  font-size: 13px;
  line-height: 1.6;
}

.download-button {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 12px 20px;
  border: 0;
  border-radius: 12px;
  background: #8b5cf6;
  color: #fff;
  font: inherit;
  font-size: 13px;
  font-weight: 700;
  text-decoration: none;
  cursor: pointer;
  transition:
      background 0.2s,
      transform 0.2s;
}

.download-button:hover {
  background: #9d71f8;
  transform: translateY(-1px);
}

.download-button:active {
  transform: translateY(0);
}

.download-button:focus-visible {
  outline: 2px solid #c4b5fd;
  outline-offset: 3px;
}

/* Планшеты: соответствует home.css */
@media (max-width: 1050px) {
  .page-content {
    padding: 32px 24px 150px;
  }

  .profile-heading {
    align-items: flex-start;
  }
}

/* Телефоны: боковое меню скрывается */
@media (max-width: 650px) {
  .main-area {
    width: 100%;
  }

  .page-content {
    padding: 20px 17px 140px;
  }

  .profile-heading {
    align-items: flex-start;
    flex-direction: column;
    gap: 16px;
  }

  .profile-heading-copy {
    flex-basis: auto;
    width: 100%;
  }

  .profile-card,
  .service-card {
    padding: 18px;
  }

  .app-download {
    flex-direction: column;
    align-items: stretch;
    gap: 14px;
  }

  .download-button {
    width: 100%;
  }

  .profile-card {
    gap: 14px;
  }

  .profile-avatar {
    flex-basis: 58px;
    width: 58px;
    height: 58px;
    border-radius: 17px;
    font-size: 25px;
  }

  .profile-user-info h2 {
    font-size: 19px;
  }

  .section-heading h2 {
    font-size: 22px;
  }

  .service-heading {
    align-items: flex-start;
    gap: 12px;
  }

  .yandex-icon {
    flex-basis: 44px;
    width: 44px;
    height: 44px;
    border-radius: 13px;
    font-size: 25px;
  }
}

@media (max-width: 360px) {
  .page-content {
    padding-right: 12px;
    padding-left: 12px;
  }

  .profile-card,
  .service-card {
    padding: 14px;
  }

  .profile-card {
    align-items: flex-start;
  }
}
</style>
