<template>
  <ion-page>
    <AppNavigation />

    <ion-content :fullscreen="true" class="skyfi-content">
      <main class="page-layout">
        <div class="eyebrow">ТВОЯ МУЗЫКА · ТВОИ ПРАВИЛА</div>

        <div class="page-heading">
          <div>
            <h1>Плейлисты</h1>
            <p class="subtitle">Собирай музыку под любое настроение</p>
          </div>

          <div class="heading-actions">
            <button class="create-button" @click="showCreate = true">
              <ion-icon :icon="addOutline" />
              <span>Создать</span>
            </button>

            <ProfileMenu />
          </div>
        </div>

        <div class="playlist-tabs">
          <button
              v-for="tab in tabs"
              :key="tab.value"
              class="tab"
              :class="{ active: activeTab === tab.value }"
              @click="activeTab = tab.value"
          >
            {{ tab.label }}
          </button>
        </div>

        <!-- Загрузка списка -->
        <section v-if="loading" class="empty-state" aria-live="polite">
          <div class="loading-icon">
            <ion-spinner name="crescent" />
          </div>

          <h3>Загружаем твои плейлисты</h3>

          <p>Получаем список плейлистов...</p>
        </section>

        <!-- Ошибка загрузки списка -->
        <section v-else-if="error" class="empty-state" role="alert">
          <div class="empty-icon error-icon">
            <ion-icon :icon="informationCircleOutline" />
          </div>

          <h3>Не удалось загрузить плейлисты</h3>

          <p>{{ error }}</p>

          <button class="retry-button" @click="loadPlaylists">
            <ion-icon :icon="refreshOutline" />

            Повторить
          </button>
        </section>

        <!-- Список плейлистов -->
        <section v-else-if="!selectedPlaylist && !detailLoading && !detailError">
          <div class="section-heading">
            <h2>{{ activeTab === 'all' ? 'Твоя коллекция' : 'Недавние' }}</h2>
            <span>{{ visiblePlaylists.length }} плейлиста</span>
          </div>

          <div v-if="visiblePlaylists.length" class="playlist-grid">
            <article
                v-for="playlist in visiblePlaylists"
                :key="playlist.id"
                class="playlist-card"
                @click="openPlaylist(playlist)"
            >
              <div
                  class="playlist-cover"
                  :style="{ '--cover-color': getTrackColor(playlist.id) }"
              >
                <div class="cover-art">
                  <ion-icon :icon="musicalNotesOutline" />
                </div>
                <button
                    class="cover-play"
                    aria-label="Открыть плейлист"
                    @click.stop="openPlaylist(playlist)"
                >
                  <ion-icon :icon="playOutline" />
                </button>
              </div>

              <div class="playlist-card-info">
                <strong>{{ playlist.name }}</strong>
                <span>
                  {{ playlist.tracks_count }}
                  {{ pluralizeTracks(playlist.tracks_count) }}
                  <template v-if="playlist.description">
                    · {{ playlist.description }}
                  </template>
                </span>
              </div>
            </article>
          </div>

          <div v-else class="empty-state">
            <ion-icon :icon="albumsOutline" />
            <h3>Здесь пока пусто</h3>
            <p>Создай плейлист и собери свою коллекцию музыки.</p>
            <button class="create-button" @click="showCreate = true">
              <ion-icon :icon="addOutline" />
              Создать плейлист
            </button>
          </div>
        </section>

        <!-- Загрузка выбранного плейлиста -->
        <section v-else-if="detailLoading" class="empty-state" aria-live="polite">
          <div class="loading-icon">
            <ion-spinner name="crescent" />
          </div>

          <h3>Открываем плейлист</h3>

          <p>Получаем композиции...</p>
        </section>

        <!-- Ошибка открытия плейлиста -->
        <section v-else-if="detailError && !selectedPlaylist" class="empty-state" role="alert">
          <div class="empty-icon error-icon">
            <ion-icon :icon="informationCircleOutline" />
          </div>

          <h3>Не удалось открыть плейлист</h3>

          <p>{{ detailError }}</p>

          <button class="retry-button" @click="closePlaylist">
            <ion-icon :icon="arrowBackOutline" />

            Все плейлисты
          </button>
        </section>

        <!-- Детали плейлиста -->
        <section v-else-if="selectedPlaylist" class="playlist-detail">
          <button class="back-button" @click="closePlaylist">
            <ion-icon :icon="arrowBackOutline" />
            Все плейлисты
          </button>

          <div class="detail-hero">
            <div
                class="detail-cover"
                :style="{ '--cover-color': getTrackColor(selectedPlaylist.id) }"
            >
              <ion-icon :icon="musicalNotesOutline" />
            </div>

            <div class="detail-info">
              <span class="eyebrow">ПЛЕЙЛИСТ</span>
              <h2>{{ selectedPlaylist.name }}</h2>
              <p v-if="selectedPlaylist.description">
                {{ selectedPlaylist.description }}
              </p>
              <span class="detail-count">
                {{ selectedPlaylist.tracks.length }}
                {{ pluralizeTracks(selectedPlaylist.tracks.length) }}
              </span>

              <div class="detail-actions">
                <button
                    class="create-button detail-play"
                    :disabled="selectedPlaylist.tracks.length === 0"
                    @click="playPlaylist"
                >
                  <ion-icon :icon="playOutline" />
                  Слушать
                </button>

                <button
                    class="delete-button"
                    :disabled="deleting"
                    @click="deleteSelectedPlaylist"
                >
                  <ion-spinner v-if="deleting" name="crescent" />
                  <ion-icon v-else :icon="trashOutline" />
                  Удалить
                </button>
              </div>
            </div>
          </div>

          <p v-if="detailError" class="detail-alert" role="alert">
            {{ detailError }}
          </p>

          <div class="section-heading">
            <h2>Композиции</h2>
            <span>
              {{ selectedPlaylist.tracks.length }}
              {{ pluralizeTracks(selectedPlaylist.tracks.length) }}
            </span>
          </div>

          <div v-if="selectedPlaylist.tracks.length" class="track-list">
            <div
                v-for="(track, index) in selectedPlaylist.tracks"
                :key="track.id"
                class="track-row"
            >
              <span class="track-number">{{ index + 1 }}</span>
              <div
                  class="track-cover"
                  :style="{ '--cover-color': getTrackColor(track.id) }"
              >
                <ion-icon :icon="musicalNotesOutline" />
              </div>
              <div class="track-info">
                <strong>{{ track.title }}</strong>
                <span>
                  {{
                    track.artists
                        ?.map(artist => artist.name)
                        .join(', ') || 'Неизвестный исполнитель'
                  }}
                </span>
              </div>
              <button
                  class="remove-button"
                  aria-label="Убрать трек из плейлиста"
                  :disabled="removingTrackId === Number(track.id)"
                  @click="removeTrack(track.id)"
              >
                <ion-spinner
                    v-if="removingTrackId === Number(track.id)"
                    name="crescent"
                />
                <ion-icon v-else :icon="closeOutline" />
              </button>
            </div>
          </div>

          <div v-else class="empty-state">
            <ion-icon :icon="musicalNotesOutline" />
            <h3>Плейлист пока пуст</h3>
            <p>Добавь композиции из каталога, когда подключим API.</p>
          </div>
        </section>
      </main>

      <div v-if="showCreate" class="modal-backdrop" @click.self="closeCreate">
        <form class="create-modal" @submit.prevent="createPlaylist">
          <button
              type="button"
              class="modal-close"
              aria-label="Закрыть"
              @click="closeCreate"
          >
            <ion-icon :icon="closeOutline" />
          </button>

          <div class="modal-icon">
            <ion-icon :icon="albumsOutline" />
          </div>

          <h2>Новый плейлист</h2>
          <p>Создай коллекцию для своего настроения.</p>

          <label for="playlist-name">Название</label>
          <input
              id="playlist-name"
              v-model="newName"
              placeholder="Например, Ночные поездки"
              maxlength="60"
              required
              autofocus
          />

          <label for="playlist-description">Описание</label>
          <input
              id="playlist-description"
              v-model="newDescription"
              placeholder="Музыка для особых моментов"
              maxlength="100"
          />

          <p v-if="formError" class="form-error">{{ formError }}</p>

          <button
              class="create-button submit-button"
              type="submit"
              :disabled="creating"
          >
            <ion-spinner v-if="creating" name="crescent" />
            <span>{{ creating ? 'Создаём...' : 'Создать плейлист' }}</span>
          </button>
        </form>
      </div>
    </ion-content>

    <AudioPlayer />
  </ion-page>
</template>

<script setup lang="ts">
import './playlists.css';

import { usePlaylists } from './playlists';

import {
  IonContent,
  IonPage,
  IonIcon,
  IonSpinner,
} from '@ionic/vue';

import {
  addOutline,
  albumsOutline,
  arrowBackOutline,
  closeOutline,
  informationCircleOutline,
  musicalNotesOutline,
  playOutline,
  refreshOutline,
  trashOutline,
} from 'ionicons/icons';

import AudioPlayer from '@/components/player/AudioPlayer.vue';
import AppNavigation from '@/components/AppNavigation.vue';
import ProfileMenu from '@/components/profile/ProfileMenu.vue';

const {
  tabs,
  activeTab,
  visiblePlaylists,
  loading,
  error,
  loadPlaylists,
  selectedPlaylist,
  detailLoading,
  detailError,
  openPlaylist,
  closePlaylist,
  deleteSelectedPlaylist,
  deleting,
  showCreate,
  newName,
  newDescription,
  formError,
  creating,
  createPlaylist,
  closeCreate,
  removeTrack,
  removingTrackId,
  playPlaylist,
  getTrackColor,
  pluralizeTracks,
} = usePlaylists();
</script>
