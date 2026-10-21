<template>
  <ion-page>
    <AppNavigation />

    <ion-content :fullscreen="true" class="skyfi-content">
      <div class="search-layout">
        <header class="search-header">
          <div>
            <div class="eyebrow">ОТКРЫВАЙ НОВОЕ</div>
            <h1>Поиск</h1>
            <p class="subtitle">Найди музыку под своё настроение</p>
          </div>
        </header>

        <!-- Строка поиска -->
        <div class="search-box">
          <ion-icon :icon="searchOutline" />

          <input
              v-model="query"
              type="search"
              placeholder="Треки, исполнители, альбомы..."
              aria-label="Поиск музыки"
          />

          <button
              v-if="query"
              class="clear-button"
              type="button"
              aria-label="Очистить поиск"
              @click="query = ''"
          >
            <ion-icon :icon="closeOutline" />
          </button>
        </div>

        <!-- Фильтры -->
        <div class="filters">
          <button
              v-for="filter in filters"
              :key="filter.value"
              class="filter"
              :class="{ active: activeFilter === filter.value }"
              type="button"
              @click="activeFilter = filter.value"
          >
            {{ filter.label }}
          </button>
        </div>

        <!-- Обзор до начала поиска -->
        <section v-if="!query.trim()" class="discovery">
          <h2>Популярные запросы</h2>

          <div class="chips">
            <button
                v-for="term in popularSearches"
                :key="term"
                class="chip"
                type="button"
                @click="query = term"
            >
              <ion-icon :icon="trendingUpOutline" />
              {{ term }}
            </button>
          </div>

          <h2 class="section-heading">Популярные жанры</h2>

          <div class="genre-grid">
            <button
                v-for="genre in genres"
                :key="genre.name"
                class="genre-card"
                :style="{ '--genre-color': genre.color }"
                type="button"
                @click="query = genre.name"
            >
              <span>{{ genre.name }}</span>
              <ion-icon :icon="musicalNotesOutline" />
            </button>
          </div>
        </section>

        <!-- Результаты поиска -->
        <section v-else class="results">
          <div class="results-heading">
            <h2>Результаты</h2>

            <span>
              {{ filteredTracks.length }}
              {{
                filteredTracks.length === 1
                    ? 'трек'
                    : 'треков'
              }}
            </span>
          </div>

          <!-- Загрузка -->
          <div v-if="searchLoading" class="empty-state">
            <div class="empty-icon">
              <ion-icon :icon="searchOutline" />
            </div>

            <h3>Ищем музыку...</h3>
            <p>Подожди немного, загружаем результаты.</p>
          </div>

          <!-- Ошибка -->
          <div v-else-if="searchError" class="empty-state">
            <h3>Не удалось выполнить поиск</h3>
            <p>{{ searchError }}</p>

            <button
                class="reset-button"
                type="button"
                @click="retrySearch"
            >
              Повторить поиск
            </button>
          </div>

          <!-- Найденные треки -->
          <div
              v-else-if="filteredTracks.length"
              class="track-list"
          >
            <div
                v-for="track in filteredTracks"
                :key="track.id"
                class="track-row"
                :class="{
                'track-row-active': isTrackPlaying(track),
                'track-row-playing': isTrackPlaying(track),
              }"
                role="button"
                tabindex="0"
                :aria-label="
                (isTrackPlaying(track) ? 'Пауза: ' : 'Воспроизвести: ')
                + track.title
              "
                @click="playTrack(track)"
                @keydown.enter.prevent="playTrack(track)"
                @keydown.space.prevent="playTrack(track)"
            >
              <!-- Обложка и кнопка Play/Pause -->
              <div
                  class="cover"
                  :style="{ '--cover-color': track.color }"
              >
                <ion-icon
                    class="cover-note"
                    :icon="musicalNotesOutline"
                />

                <button
                    class="cover-play"
                    type="button"
                    :aria-label="
                    isTrackPlaying(track)
                      ? 'Пауза'
                      : 'Воспроизвести ' + track.title
                  "
                    @click.stop="playTrack(track)"
                >
                  <ion-icon
                      :icon="
                      isTrackPlaying(track)
                        ? pauseOutline
                        : playOutline
                    "
                  />
                </button>
              </div>

              <!-- Информация о треке -->
              <div class="track-info">
                <div class="track-title">
                  {{ track.title }}
                </div>

                <div class="track-artist">
                  {{
                    track.artists
                        ?.map((artist) => artist.name)
                        .join(', ') || 'Неизвестный исполнитель'
                  }}
                </div>

                <span
                    v-if="track.album?.title"
                    class="track-album"
                >
                  {{ track.album.title }}
                </span>
              </div>

              <!-- Действия -->
              <div class="track-actions">
                <button
                    class="favorite-button"
                    :class="{ liked: isFavorite(track.id) }"
                    type="button"
                    :aria-label="
                    isFavorite(track.id)
                      ? 'Удалить из избранного'
                      : 'Добавить в избранное'
                  "
                    :aria-pressed="isFavorite(track.id)"
                    :disabled="favoriteLoadingIds.has(track.id)"
                    @click.stop="toggleFavorite(track)"
                >
                  <ion-icon :icon="heart" />
                </button>
              </div>
            </div>
          </div>

          <!-- Пустой результат -->
          <div v-else class="empty-state">
            <div class="empty-icon">
              <ion-icon :icon="searchOutline" />
            </div>

            <h3>Ничего не найдено</h3>

            <p>
              Попробуй другое название или имя исполнителя.
            </p>

            <button
                class="reset-button"
                type="button"
                @click="query = ''"
            >
              Вернуться к обзору
            </button>
          </div>
        </section>

        <div class="demo-note">
          <ion-icon :icon="informationCircleOutline" />
          Результаты поиска музыки SkyFi.
        </div>
      </div>
    </ion-content>

    <!-- Единый глобальный аудиоплеер -->
    <AudioPlayer />
  </ion-page>
</template>

<script setup lang="ts">
import {
  IonContent,
  IonPage,
  IonIcon,
} from '@ionic/vue';

import AppNavigation from '@/components/AppNavigation.vue';
import AudioPlayer from '@/components/player/AudioPlayer.vue';

import { useSearch } from './search';

const {
  query,
  activeFilter,
  filters,
  popularSearches,
  genres,

  searchLoading,
  searchError,
  filteredTracks,

  currentTrack,
  isPlaying,
  isTrackPlaying,
  playTrack,

  favoriteLoadingIds,
  isFavorite,
  toggleFavorite,

  retrySearch,

  searchOutline,
  closeOutline,
  trendingUpOutline,
  musicalNotesOutline,
  playOutline,
  pauseOutline,
  informationCircleOutline,
  heart,
} = useSearch();
</script>

<style src="./search.css" scoped></style>