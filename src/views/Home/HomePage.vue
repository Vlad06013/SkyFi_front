<template>
  <ion-page>
    <ion-content :fullscreen="true" class="skyfi-content">
      <div class="app-layout">
        <!-- Боковая панель -->
        <aside class="sidebar">
          <div class="brand">
            <div class="brand-icon">S</div>
            <span>Sky<span class="brand-light">Fi</span></span>
          </div>

          <div class="nav-label">МЕНЮ</div>

          <button
              v-for="item in menu"
              :key="item.id"
              class="nav-item"
              :class="{ active: activeMenu === item.id }"
              @click="navigateTo(item.id)"
          >
            <span class="nav-icon">{{ item.icon }}</span>
            {{ item.label }}
          </button>

          <div class="sidebar-bottom">
            <div class="sidebar-note">
              Твоя музыка.<br />
              Твоё пространство.
            </div>

            <div class="version">SKYFI · PREVIEW</div>
          </div>
        </aside>

        <!-- Основная область -->
        <main class="main-area">
          <header class="topbar">
            <div class="mobile-brand">
              <div class="brand-icon">S</div>
              <strong>SkyFi</strong>
            </div>


            <!-- Меню пользователя -->
            <ProfileMenu />
          </header>

          <!-- Контент страницы -->
          <div class="page-content">
            <!-- Приветственный баннер -->
            <section class="welcome">
              <div class="welcome-copy">
                <div class="eyebrow">
                  <span></span>
                  ТВОЯ МУЗЫКА, ТВОЙ МИР
                </div>

                <h1>
                  Слушай своё.<br />
                  <span>Чувствуй больше.</span>
                </h1>

                <p>
                  Музыка для каждого момента твоей жизни.
                </p>

                <button
                    class="primary-button"
                    :disabled="!tracks.length"
                    @click="tracks[0] && playTrack(tracks[0])"
                >
                  <span>▶</span>
                  Начать слушать
                </button>
              </div>

              <div class="hero-art">
                <div class="hero-orb orb-one"></div>
                <div class="hero-orb orb-two"></div>

                <div class="hero-disc">
                  <div></div>
                </div>

                <div class="hero-caption">
                  SOUND OF YOUR WORLD
                </div>
              </div>
            </section>

            <!-- Музыка и результаты поиска -->
            <section class="section">
              <div class="section-heading">
                <div>
                  <div class="eyebrow">
                    {{ search.trim() ? 'ПОИСК МУЗЫКИ' : 'ПОД ТВОЁ НАСТРОЕНИЕ' }}
                  </div>

                  <h2>
                    {{
                      search.trim()
                          ? 'Результаты поиска'
                          : 'Тебе может понравиться'
                    }}
                  </h2>
                </div>

                <button
                    class="text-button"
                    @click="search = ''"
                >
                  Все треки ↗
                </button>
              </div>

            </section>

            <!-- Быстрый доступ -->
            <section class="section quick-section">
              <div class="section-heading">
                <div>
                  <div class="eyebrow">ТВОЯ КОЛЛЕКЦИЯ</div>
                  <h2>Быстрый доступ</h2>
                </div>
              </div>

              <div class="quick-grid">
                <button
                    class="quick-card"
                    @click="navigateTo('library')"
                >
                  <span class="quick-icon purple">♫</span>

                  <span>
                    <strong>Моя музыка</strong>
                    <small>Твоя личная коллекция</small>
                  </span>

                  <span class="quick-arrow">↗</span>
                </button>

                <button
                    class="quick-card"
                    @click="navigateTo('playlists')"
                >
                  <span class="quick-icon green">≋</span>

                  <span>
                    <strong>Плейлисты</strong>
                    <small>Музыка под настроение</small>
                  </span>

                  <span class="quick-arrow">↗</span>
                </button>
              </div>
            </section>
          </div>
        </main>
      </div>

      <!-- Нижний музыкальный плеер -->
      <AudioPlayer />
    </ion-content>

    <!-- Единая навигация SkyFi -->
    <AppNavigation />
  </ion-page>
</template>

<script setup lang="ts">
import { IonPage, IonContent } from '@ionic/vue';

import AudioPlayer from '@/components/player/AudioPlayer.vue';
import AppNavigation from '@/components/AppNavigation.vue';
import ProfileMenu from '@/components/profile/ProfileMenu.vue';

import { useHome } from './home';
import YandexMusicAuth from "@/components/Auth/YandexMusic/YandexMusicAuth.vue";

const {
  menu,
  activeMenu,
  search,
  tracks,
  navigateTo,

  playTrack,
} = useHome();
</script>

<style src="./home.css"></style>
