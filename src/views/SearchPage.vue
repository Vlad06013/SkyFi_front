
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
              aria-label="Очистить поиск"
              @click="query = ''"
          >
            <ion-icon :icon="closeOutline" />
          </button>
        </div>

        <div class="filters">
          <button
              v-for="filter in filters"
              :key="filter.value"
              class="filter"
              :class="{ active: activeFilter === filter.value }"
              @click="activeFilter = filter.value"
          >
            {{ filter.label }}
          </button>
        </div>

        <section v-if="!query.trim()" class="discovery">
          <h2>Популярные запросы</h2>
          <div class="chips">
            <button
                v-for="term in popularSearches"
                :key="term"
                class="chip"
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
                @click="query = genre.name"
            >
              <span>{{ genre.name }}</span>
              <ion-icon :icon="musicalNotesOutline" />
            </button>
          </div>
        </section>

        <section v-else class="results">
          <div class="results-heading">
            <h2>Результаты</h2>
            <span>{{ filteredTracks.length }} трека</span>
          </div>

          <div v-if="filteredTracks.length" class="track-list">
            <div
                v-for="track in filteredTracks"
                :key="track.id"
                class="track-row"
            >
              <div
                  class="cover"
                  :style="{ '--cover-color': track.color }"
              >
                <ion-icon :icon="musicalNotesOutline" />
                <button
                    class="cover-play"
                    :aria-label="'Воспроизвести ' + track.title"
                    @click="playTrack(track)"
                >
                  <ion-icon
                      :icon="currentTrack?.id === track.id && isPlaying
                      ? pauseOutline
                      : playOutline"
                  />
                </button>
              </div>

              <div class="track-info">
                <div class="track-title">{{ track.title }}</div>
                <div class="track-artist">{{ track.artist }}</div>
                <span class="track-album">{{ track.album }}</span>
              </div>

              <div class="track-actions">
                <button
                    class="favorite-button"
                    :class="{ liked: isFavorite(track.id) }"
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

                <button
                    class="row-play"
                    :aria-label="'Воспроизвести ' + track.title"
                    @click="playTrack(track)"
                >
                  <ion-icon
                      :icon="
          currentTrack?.id === track.id && isPlaying
            ? pauseOutline
            : playOutline
        "
                  />
                </button>
              </div>
            </div>
          </div>

          <div v-else class="empty-state">
            <div class="empty-icon">
              <ion-icon :icon="searchOutline" />
            </div>
            <h3>Ничего не найдено</h3>
            <p>Попробуй другое название или имя исполнителя.</p>
            <button class="reset-button" @click="query = ''">
              Вернуться к обзору
            </button>
          </div>
        </section>

        <div class="demo-note">
          <ion-icon :icon="informationCircleOutline" />
          Сейчас показаны демонстрационные данные.
        </div>
      </div>
    </ion-content>

    <div v-if="currentTrack" class="mini-player">
      <div
          class="mini-cover"
          :style="{ '--cover-color': currentTrack.color }"
      >
        <ion-icon :icon="musicalNotesOutline" />
      </div>
      <div class="mini-info">
        <strong>{{ currentTrack.title }}</strong>
        <span>{{ currentTrack.artist }}</span>
      </div>
      <button
          class="mini-play"
          :aria-label="isPlaying ? 'Пауза' : 'Воспроизвести'"
          @click="isPlaying = !isPlaying"
      >
        <ion-icon :icon="isPlaying ? pauseOutline : playOutline" />
      </button>
    </div>
  </ion-page>
</template>

<script setup lang="ts">
import { computed, ref, watch, onMounted, onBeforeUnmount } from 'vue';

import AppNavigation from '@/components/AppNavigation.vue';

import {
  IonContent,
  IonPage,
  IonIcon,
} from '@ionic/vue';

import {
  searchOutline,
  closeOutline,
  trendingUpOutline,
  musicalNotesOutline,
  playOutline,
  pauseOutline,
  informationCircleOutline,
  heart,
} from 'ionicons/icons';

import {
  searchExternalTracks,
  getFavorites,
  addExternalFavorite,
  removeFavorite,
  type ExternalTrack,
  type Track as ApiTrack,
} from '@/api/tracks';

// ============================================
// ТИПЫ
// ============================================

type SearchTrack = ExternalTrack & {
  color: string;
  album: string;
};

type FavoriteTrack = ApiTrack & {
  source_id?: string | null;
  source_type?: string;
};

// ============================================
// СОСТОЯНИЕ ПОИСКА
// ============================================

const query = ref('');

const activeFilter = ref('all');

const externalTracks = ref<SearchTrack[]>([]);

const searchLoading = ref(false);

const searchError = ref('');

let searchTimeout: ReturnType<typeof setTimeout> | undefined;

let searchRequestId = 0;

// ============================================
// МУЗЫКАЛЬНЫЙ ПЛЕЕР
// ============================================

const currentTrack = ref<SearchTrack | null>(null);

const isPlaying = ref(false);

function playTrack(track: SearchTrack) {
  if (currentTrack.value?.id === track.id) {
    isPlaying.value = !isPlaying.value;
    return;
  }

  currentTrack.value = track;
  isPlaying.value = true;

  // Здесь переключается состояние интерфейса плеера.
  // Для реального воспроизведения используй существующую
  // логику аудиоплеера приложения.
}

// ============================================
// ФИЛЬТРЫ
// ============================================

const filters = [
  { label: 'Всё', value: 'all' },
  { label: 'Треки', value: 'tracks' },
  { label: 'Исполнители', value: 'artists' },
  { label: 'Альбомы', value: 'albums' },
];

const popularSearches = [
  'Популярная музыка',
  'Электроника',
  'Рок',
  'Для дороги',
];

const genres = [
  { name: 'Электроника', color: '#6846C7' },
  { name: 'Рок', color: '#A64258' },
  { name: 'Хип-хоп', color: '#B76B32' },
  { name: 'Чилл', color: '#267E83' },
];

const coverColors = [
  '#6546B8',
  '#277D8A',
  '#A04C72',
  '#B26A38',
  '#6846C7',
];

// ============================================
// РЕЗУЛЬТАТЫ ПОИСКА
// ============================================

const filteredTracks = computed(() => {
  if (
      !query.value.trim() ||
      activeFilter.value === 'artists' ||
      activeFilter.value === 'albums'
  ) {
    return [];
  }

  return externalTracks.value;
});

async function performSearch(term: string) {
  const requestId = ++searchRequestId;

  searchLoading.value = true;
  searchError.value = '';

  try {
    const response = await searchExternalTracks(term, 20);

    // Не применяем устаревшие ответы.
    if (requestId !== searchRequestId) {
      return;
    }

    externalTracks.value = response.data.map((track, index) => ({
      ...track,
      color: coverColors[index % coverColors.length],
      album: 'Internet Archive',
    }));
  } catch (error) {
    if (requestId !== searchRequestId) {
      return;
    }

    console.error('Ошибка поиска музыки:', error);

    externalTracks.value = [];

    searchError.value =
        'Не удалось выполнить поиск. Попробуй ещё раз.';
  } finally {
    if (requestId === searchRequestId) {
      searchLoading.value = false;
    }
  }
}

watch(query, (value) => {
  if (searchTimeout) {
    clearTimeout(searchTimeout);
  }

  const term = value.trim();

  if (!term) {
    searchRequestId++;

    externalTracks.value = [];

    searchError.value = '';

    searchLoading.value = false;

    return;
  }

  if (term.length < 2) {
    externalTracks.value = [];
    searchError.value = '';
    searchLoading.value = false;

    return;
  }

  searchTimeout = setTimeout(() => {
    void performSearch(term);
  }, 400);
});

// ============================================
// ИЗБРАННОЕ
// ============================================

// Здесь храним внешние идентификаторы треков.
// Например, Classical_Sampler-9615.

const favoriteExternalIds = ref<Set<string>>(new Set());

// Здесь храним числовые ID записей SkyFi.
// Они нужны для удаления записей через DELETE /favorites/{track}.

const favoriteDatabaseIds = ref<Map<string, number>>(new Map());

// Состояние загрузки отдельно для каждой песни.

const favoriteLoadingIds = ref<Set<string>>(new Set());

function isFavorite(externalId: string): boolean {
  return favoriteExternalIds.value.has(externalId);
}

// ============================================
// ЗАГРУЗКА ИЗБРАННОГО ИЗ БАЗЫ
// ============================================

async function loadFavorites() {
  try {
    const response = await getFavorites();

    const externalIds = new Set<string>();

    const databaseIds = new Map<string, number>();

    for (const track of response.data as FavoriteTrack[]) {
      if (
          track.source_type !== 'internet_archive' ||
          !track.source_id
      ) {
        continue;
      }

      externalIds.add(track.source_id);

      databaseIds.set(
          track.source_id,
          track.id,
      );
    }

    favoriteExternalIds.value = externalIds;

    favoriteDatabaseIds.value = databaseIds;
  } catch (error) {
    console.error(
        'Не удалось загрузить избранное:',
        error,
    );
  }
}

// ============================================
// ДОБАВЛЕНИЕ И УДАЛЕНИЕ ИЗБРАННОГО
// ============================================

async function toggleFavorite(track: SearchTrack) {
  const externalId = track.id;

  if (favoriteLoadingIds.value.has(externalId)) {
    return;
  }

  favoriteLoadingIds.value = new Set([
    ...favoriteLoadingIds.value,
    externalId,
  ]);

  try {
    if (isFavorite(externalId)) {
      // Для удаления нужен внутренний ID записи SkyFi.
      const databaseId = favoriteDatabaseIds.value.get(externalId);

      if (databaseId === undefined) {
        // Если связь не найдена, обновляем данные с сервера.
        await loadFavorites();

        const refreshedId =
            favoriteDatabaseIds.value.get(externalId);

        if (refreshedId === undefined) {
          throw new Error(
              'Не найден ID трека SkyFi для удаления из избранного.',
          );
        }

        await removeFavorite(refreshedId);
      } else {
        await removeFavorite(databaseId);
      }

      // Обновляем интерфейс после успешного удаления.
      const externalIds = new Set(favoriteExternalIds.value);

      externalIds.delete(externalId);

      favoriteExternalIds.value = externalIds;

      const databaseIds = new Map(favoriteDatabaseIds.value);

      databaseIds.delete(externalId);

      favoriteDatabaseIds.value = databaseIds;
    } else {
      // Сервер создаёт или находит запись в tracks
      // и сохраняет связь с пользователем в favorites.
      const response = await addExternalFavorite(track);

      const externalIds = new Set(favoriteExternalIds.value);

      externalIds.add(externalId);

      favoriteExternalIds.value = externalIds;

      const databaseIds = new Map(favoriteDatabaseIds.value);

      databaseIds.set(
          externalId,
          response.track_id,
      );

      favoriteDatabaseIds.value = databaseIds;
    }
  } catch (error) {
    console.error(
        'Не удалось изменить избранное:',
        error,
    );
  } finally {
    const loadingIds = new Set(favoriteLoadingIds.value);

    loadingIds.delete(externalId);

    favoriteLoadingIds.value = loadingIds;
  }
}

// ============================================
// ИНИЦИАЛИЗАЦИЯ
// ============================================

onMounted(() => {
  void loadFavorites();
});

// ============================================
// ОЧИСТКА
// ============================================

onBeforeUnmount(() => {
  if (searchTimeout) {
    clearTimeout(searchTimeout);
  }

  // Игнорируем ответы поиска, пришедшие после ухода со страницы.
  searchRequestId++;
});
</script>

<style scoped>
.skyfi-content {
  --background: #0b0d12;
  color: #f5f7fa;
}

.search-layout {
  width: 100%;
  max-width: 1050px;
  margin: 0 auto;
  padding: 42px 36px 120px;
  box-sizing: border-box;
}

.search-header {
  margin-bottom: 28px;
}

.eyebrow {
  color: #a78bfa;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 2px;
  margin-bottom: 10px;
}

h1 {
  color: #f5f7fa;
  font-size: clamp(30px, 5vw, 42px);
  font-weight: 800;
  letter-spacing: -1.5px;
  margin: 0;
}

.subtitle {
  color: #9296a7;
  margin: 10px 0 0;
  font-size: 14px;
}

.search-box {
  display: flex;
  align-items: center;
  gap: 13px;
  height: 60px;
  padding: 0 19px;
  background: #171a23;
  border: 1px solid #292d3b;
  border-radius: 17px;
  transition: border-color 0.2s;
}

.search-box:focus-within {
  border-color: #8b5cf6;
}

.search-box > ion-icon {
  color: #a78bfa;
  font-size: 22px;
  flex-shrink: 0;
}

.search-box input {
  flex: 1;
  width: 0;
  background: transparent;
  color: #f5f7fa;
  border: 0;
  outline: none;
  font-size: 15px;
}

.search-box input::placeholder {
  color: #777c8d;
}

.clear-button,
.row-play,
.mini-play {
  display: grid;
  place-items: center;
  border: 0;
  cursor: pointer;
}

.clear-button {
  background: transparent;
  color: #a4a7b5;
  font-size: 20px;
}

.filters {
  display: flex;
  gap: 9px;
  flex-wrap: wrap;
  margin: 22px 0 34px;
}

.filter {
  padding: 10px 17px;
  color: #a5a8b7;
  background: #171a23;
  border: 1px solid #292d3b;
  border-radius: 12px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: 0.2s;
}

.filter:hover {
  border-color: #8b5cf6;
}

.filter.active {
  background: #8b5cf6;
  border-color: #8b5cf6;
  color: white;
}

h2 {
  color: #f5f7fa;
  font-size: 19px;
  font-weight: 750;
  letter-spacing: -0.3px;
  margin: 0 0 18px;
}

.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.chip {
  display: flex;
  align-items: center;
  gap: 8px;
  background: #171a23;
  border: 1px solid #292d3b;
  border-radius: 12px;
  padding: 12px 15px;
  color: #d7d9e2;
  cursor: pointer;
}

.chip ion-icon {
  color: #a78bfa;
}

.section-heading {
  margin-top: 38px;
}

.genre-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}

.genre-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 105px;
  padding: 20px;
  border: 1px solid #ffffff12;
  border-radius: 17px;
  background: linear-gradient(
      125deg,
      var(--genre-color),
      #171a23 115%
  );
  color: white;
  font-size: 16px;
  font-weight: 750;
  text-align: left;
  cursor: pointer;
  transition: transform 0.2s;
}

.genre-card:hover {
  transform: translateY(-2px);
}

.genre-card ion-icon {
  font-size: 27px;
  opacity: 0.85;
}

.results-heading {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.results-heading span {
  color: #9296a7;
  font-size: 13px;
}

.track-list {
  display: flex;
  flex-direction: column;
  gap: 7px;
}

.track-row {
  display: flex;
  align-items: center;
  gap: 15px;
  padding: 11px;
  border-radius: 14px;
  transition: background 0.2s;
}

.track-row:hover {
  background: #171a23;
}

.cover,
.mini-cover {
  position: relative;
  display: grid;
  place-items: center;
  flex-shrink: 0;
  background: linear-gradient(
      140deg,
      var(--cover-color),
      #171a23
  );
  color: #ffffffc9;
}

.cover {
  width: 62px;
  height: 62px;
  border-radius: 12px;
  font-size: 27px;
  overflow: hidden;
}

.cover-play {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  background: #08091080;
  color: white;
  border: 0;
  font-size: 25px;
  opacity: 0;
  cursor: pointer;
  transition: opacity 0.2s;
}

.track-row:hover .cover-play,
.cover-play:focus-visible {
  opacity: 1;
}

.track-info {
  flex: 1;
  min-width: 0;
}

.track-title {
  color: #f5f7fa;
  font-size: 14px;
  font-weight: 700;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.track-artist,
.track-album {
  display: block;
  color: #9296a7;
  font-size: 12px;
  margin-top: 5px;
}

.row-play {
  width: 38px;
  height: 38px;
  border-radius: 50%;
  color: #d7c8ff;
  background: #8b5cf61a;
  font-size: 20px;
  flex-shrink: 0;
}

.empty-state {
  text-align: center;
  padding: 45px 15px;
}

.empty-icon {
  display: grid;
  place-items: center;
  width: 65px;
  height: 65px;
  margin: 0 auto 20px;
  border-radius: 22px;
  background: #8b5cf61a;
  color: #a78bfa;
  font-size: 28px;
}

.empty-state h3 {
  color: #f5f7fa;
  margin: 0 0 10px;
}

.empty-state p {
  color: #9296a7;
  font-size: 14px;
}

.reset-button {
  margin-top: 14px;
  background: #8b5cf6;
  border: 0;
  border-radius: 12px;
  padding: 12px 18px;
  color: white;
  font-weight: 650;
  cursor: pointer;
}

.demo-note {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #777c8d;
  font-size: 12px;
  margin-top: 35px;
}

.demo-note ion-icon {
  font-size: 17px;
}

.mini-player {
  position: fixed;
  z-index: 20;
  left: 50%;
  bottom: 16px;
  transform: translateX(-50%);
  width: min(600px, calc(100% - 32px));
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 11px 14px;
  border: 1px solid #343043;
  border-radius: 17px;
  background: #171722f5;
  backdrop-filter: blur(20px);
  box-shadow: 0 12px 40px #0006;
}

.mini-cover {
  width: 43px;
  height: 43px;
  border-radius: 10px;
  font-size: 21px;
}

.mini-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.mini-info strong,
.mini-info span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mini-info strong {
  color: #f5f7fa;
  font-size: 13px;
}

.mini-info span {
  color: #9296a7;
  font-size: 11px;
}

.mini-play {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: #8b5cf6;
  color: white;
  font-size: 23px;
}

@media (max-width: 650px) {
  .search-layout {
    max-width: 100%;
    margin-left: 0;
    padding: 30px 18px 120px;
  }

  .genre-grid {
    gap: 10px;
  }

  .genre-card {
    min-height: 90px;
    padding: 14px;
    font-size: 14px;
  }

  .search-box {
    height: 55px;
    padding: 0 14px;
  }

  .cover {
    width: 54px;
    height: 54px;
  }
}
@media (min-width: 701px) {
  .search-layout {
    margin-left: 236px;
    width: calc(100% - 236px);
    max-width: none;
  }
}

@media (max-width: 700px) {
  .search-layout {
    width: 100%;
    margin-left: 0;
    max-width: 100%;
    padding: 30px 18px 120px;
  }
}
</style>
