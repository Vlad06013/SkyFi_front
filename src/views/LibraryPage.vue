<template>
  <ion-page>
    <ion-content :fullscreen="true" class="library-content">
      <main class="library-layout">
        <!-- Заголовок -->
        <div class="eyebrow">ТВОЯ КОЛЛЕКЦИЯ</div>

        <h1>Моя музыка</h1>

        <p class="subtitle">
          Всё любимое — в одном месте
        </p>

        <!-- Вкладки -->
        <div class="library-tabs">
          <button
              v-for="tab in tabs"
              :key="tab.value"
              type="button"
              class="tab"
              :class="{ active: activeTab === tab.value }"
              @click="activeTab = tab.value"
          >
            {{ tab.label }}
          </button>
        </div>

        <!-- Загрузка -->
        <div v-if="loading" class="empty-state">
          <ion-spinner name="crescent" />

          <p>Загружаем твою коллекцию...</p>
        </div>

        <!-- Ошибка -->
        <div v-else-if="error" class="empty-state">
          <ion-icon :icon="informationCircleOutline" />

          <h3>Не удалось загрузить музыку</h3>

          <p>{{ error }}</p>

          <button
              type="button"
              class="retry-button"
              @click="loadLibrary"
          >
            Повторить
          </button>
        </div>

        <!-- Треки и избранное -->
        <section
            v-else-if="
            activeTab === 'tracks' ||
            activeTab === 'favorites'
          "
        >
          <div class="section-heading">
            <h2>
              {{
                activeTab === 'favorites'
                    ? 'Избранное'
                    : 'Твои треки'
              }}
            </h2>

            <span>
              {{ visibleTracks.length }}
              {{
                visibleTracks.length === 1
                    ? 'трек'
                    : visibleTracks.length >= 2 &&
                    visibleTracks.length <= 4
                        ? 'трека'
                        : 'треков'
              }}
            </span>
          </div>

          <!-- Список треков -->
          <div
              v-if="visibleTracks.length"
              class="track-list"
          >
            <div
                v-for="track in visibleTracks"
                :key="track.id"
                class="track-row"
            >
              <!-- Обложка -->
              <div
                  class="cover"
                  :style="{
                  '--cover-color': getTrackColor(track.id)
                }"
              >
                <ion-icon :icon="musicalNotesOutline" />
              </div>

              <!-- Информация -->
              <div class="track-info">
                <strong>{{ track.title }}</strong>

                <span>
                  {{
                    track.artists
                        ?.map(artist => artist.name)
                        .join(', ') || 'Неизвестный исполнитель'
                  }}
                </span>

                <small>
                  {{ track.album?.title || 'Без альбома' }}
                </small>
              </div>

              <!-- Избранное -->
              <button
                  type="button"
                  class="favorite-button"
                  :class="{
                  liked: isFavorite(track.id)
                }"
                  :aria-label="
                  isFavorite(track.id)
                    ? 'Убрать из избранного'
                    : 'Добавить в избранное'
                "
                  :aria-pressed="isFavorite(track.id)"
                  :disabled="favoriteLoadingIds.has(track.id)"
                  @click="toggleFavorite(track)"
              >
                <ion-spinner
                    v-if="favoriteLoadingIds.has(track.id)"
                    name="crescent"
                />

                <ion-icon
                    v-else
                    :icon="
                    isFavorite(track.id)
                      ? heart
                      : heartOutline
                  "
                />
              </button>
            </div>
          </div>

          <!-- Пустой список -->
          <div v-else class="empty-state">
            <ion-icon :icon="musicalNotesOutline" />

            <h3>
              {{
                activeTab === 'favorites'
                    ? 'Пока нет избранных треков'
                    : 'Коллекция пока пуста'
              }}
            </h3>

            <p>
              {{
                activeTab === 'favorites'
                    ? 'Добавляй понравившиеся треки в избранное.'
                    : 'Здесь появятся опубликованные треки SkyFi.'
              }}
            </p>
          </div>
        </section>

        <!-- Альбомы -->
        <section v-else-if="activeTab === 'albums'">
          <h2>Альбомы</h2>

          <div
              v-if="albums.length"
              class="collection-grid"
          >
            <article
                v-for="album in albums"
                :key="album.id"
                class="collection-card"
            >
              <div
                  class="album-cover"
                  :style="{
                  '--cover-color': getTrackColor(album.id)
                }"
              >
                <ion-icon :icon="discOutline" />
              </div>

              <strong>{{ album.title }}</strong>

              <span>
                {{ album.tracksCount }}
                {{
                  album.tracksCount === 1
                      ? 'трек'
                      : 'треков'
                }}
              </span>
            </article>
          </div>

          <div v-else class="empty-state">
            <ion-icon :icon="discOutline" />

            <h3>Альбомов пока нет</h3>

            <p>
              Альбомы появятся, когда они будут связаны
              с опубликованными треками.
            </p>
          </div>
        </section>

        <!-- Исполнители -->
        <section v-else>
          <h2>Исполнители</h2>

          <div
              v-if="artists.length"
              class="artist-list"
          >
            <div
                v-for="artist in artists"
                :key="artist.id"
                class="artist-row"
            >
              <div class="artist-avatar">
                {{ artist.name.slice(0, 1).toUpperCase() }}
              </div>

              <strong>{{ artist.name }}</strong>

              <span class="artist-track-count">
                {{ artist.tracksCount }}
              </span>

              <ion-icon :icon="chevronForwardOutline" />
            </div>
          </div>

          <div v-else class="empty-state">
            <ion-icon :icon="musicalNotesOutline" />

            <h3>Исполнителей пока нет</h3>

            <p>
              Они появятся, когда будут добавлены
              к опубликованным трекам.
            </p>
          </div>
        </section>
      </main>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import {
  computed,
  onMounted,
  ref,
} from 'vue';

import {
  IonContent,
  IonPage,
  IonIcon,
  IonSpinner,
} from '@ionic/vue';

import {
  musicalNotesOutline,
  heart,
  heartOutline,
  discOutline,
  chevronForwardOutline,
  informationCircleOutline,
} from 'ionicons/icons';

import {
  getTracks,
  getFavorites,
  addFavorite,
  removeFavorite,
  type Track,
} from '@/api/tracks';

// ============================================
// ВКЛАДКИ
// ============================================

type LibraryTab = 'tracks' | 'albums' | 'artists' | 'favorites';

const tabs: {
  label: string;
  value: LibraryTab;
}[] = [
  { label: 'Треки', value: 'tracks' },
  { label: 'Альбомы', value: 'albums' },
  { label: 'Исполнители', value: 'artists' },
  { label: 'Избранное', value: 'favorites' },
];

const activeTab = ref<LibraryTab>('tracks');

// ============================================
// СОСТОЯНИЕ
// ============================================

const tracks = ref<Track[]>([]);

const favoriteTracks = ref<Track[]>([]);

const loading = ref(false);

const error = ref('');

// Для каждого трека отслеживаем отдельную операцию.

const favoriteLoadingIds = ref<Set<number>>(new Set());

// ============================================
// ИЗБРАННОЕ
// ============================================

const favoriteIds = computed(() => {
  return new Set(
      favoriteTracks.value.map(track => track.id),
  );
});

/**
 * Проверить, находится ли трек в избранном.
 */
function isFavorite(trackId: number): boolean {
  return favoriteIds.value.has(trackId);
}

/**
 * Переключить состояние избранного.
 *
 * API изменяет запись в базе данных.
 * Интерфейс обновляем только после успешного ответа.
 */
async function toggleFavorite(track: Track): Promise<void> {
  const trackId = track.id;

  if (favoriteLoadingIds.value.has(trackId)) {
    return;
  }

  const wasFavorite = isFavorite(trackId);

  favoriteLoadingIds.value.add(trackId);

  // Создаём новый Set, чтобы Vue отследил изменение.
  favoriteLoadingIds.value = new Set(
      favoriteLoadingIds.value,
  );

  try {
    if (wasFavorite) {
      await removeFavorite(trackId);

      favoriteTracks.value = favoriteTracks.value.filter(
          item => item.id !== trackId,
      );
    } else {
      await addFavorite(trackId);

      // Не добавляем дубликаты.
      if (!isFavorite(trackId)) {
        favoriteTracks.value = [
          track,
          ...favoriteTracks.value,
        ];
      }
    }
  } catch (err) {
    console.error(
        'Ошибка изменения избранного:',
        err,
    );

    error.value =
        'Не удалось изменить избранное. Проверь подключение и авторизацию.';

    // Через несколько секунд убираем сообщение,
    // чтобы оно не мешало работе со страницей.
    window.setTimeout(() => {
      error.value = '';
    }, 4000);
  } finally {
    const updatedIds = new Set(
        favoriteLoadingIds.value,
    );

    updatedIds.delete(trackId);

    favoriteLoadingIds.value = updatedIds;
  }
}

// ============================================
// АЛЬБОМЫ
// ============================================

const albums = computed(() => {
  const result = new Map<
      number,
      {
        id: number;
        title: string;
        tracksCount: number;
      }
  >();

  for (const track of tracks.value) {
    if (!track.album) {
      continue;
    }

    const albumId = (
        track as Track & {
          album_id?: number | null;
        }
    ).album_id ?? track.album.id;

    const existing = result.get(albumId);

    if (existing) {
      existing.tracksCount++;
    } else {
      result.set(albumId, {
        id: albumId,
        title: track.album.title,
        tracksCount: 1,
      });
    }
  }

  return Array.from(result.values());
});

// ============================================
// ИСПОЛНИТЕЛИ
// ============================================

const artists = computed(() => {
  const result = new Map<
      number,
      {
        id: number;
        name: string;
        tracksCount: number;
      }
  >();

  for (const track of tracks.value) {
    for (const artist of track.artists ?? []) {
      const existing = result.get(artist.id);

      if (existing) {
        existing.tracksCount++;
      } else {
        result.set(artist.id, {
          id: artist.id,
          name: artist.name,
          tracksCount: 1,
        });
      }
    }
  }

  return Array.from(result.values()).sort(
      (a, b) => a.name.localeCompare(b.name, 'ru'),
  );
});

// ============================================
// ВИДИМЫЕ ТРЕКИ
// ============================================

const visibleTracks = computed(() => {
  if (activeTab.value === 'favorites') {
    return favoriteTracks.value;
  }

  return tracks.value;
});

// ============================================
// ЦВЕТА ОБЛОЖЕК
// ============================================

const coverColors = [
  '#6546B8',
  '#277D8A',
  '#A04C72',
  '#B26A38',
  '#3569A8',
  '#47865C',
  '#8157A6',
];

function getTrackColor(id: number): string {
  return coverColors[id % coverColors.length];
}

// ============================================
// ЗАГРУЗКА КОЛЛЕКЦИИ
// ============================================

async function loadLibrary(): Promise<void> {
  loading.value = true;
  error.value = '';

  try {
    // Загружаем каталог и избранное параллельно.
    const [tracksResponse, favoritesResponse] =
        await Promise.all([
          getTracks(),
          getFavorites(),
        ]);

    tracks.value = tracksResponse.data;

    favoriteTracks.value = favoritesResponse.data;
  } catch (err) {
    console.error(
        'Ошибка загрузки музыкальной коллекции:',
        err,
    );

    tracks.value = [];
    favoriteTracks.value = [];

    error.value =
        'Не удалось получить данные. Убедись, что ты вошёл в аккаунт и API доступен.';
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  void loadLibrary();
});
</script>

<style scoped>
.library-content {
  --background: #0b0d12;
  color: #f5f7fa;
}

.library-layout {
  max-width: 1050px;
  margin: 0 auto;
  padding: 42px 36px 100px;
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
  margin: 10px 0 30px;
  font-size: 14px;
}

h2 {
  color: #f5f7fa;
  font-size: 19px;
  margin: 0 0 18px;
}

.library-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 9px;
  margin-bottom: 34px;
}

.tab {
  padding: 10px 16px;
  color: #a5a8b7;
  background: #171a23;
  border: 1px solid #292d3b;
  border-radius: 12px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition:
      background 0.2s,
      border-color 0.2s,
      color 0.2s;
}

.tab.active {
  color: white;
  background: #8b5cf6;
  border-color: #8b5cf6;
}

.section-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.section-heading span {
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

.track-row:hover,
.artist-row:hover {
  background: #171a23;
}

.cover,
.album-cover {
  display: grid;
  place-items: center;
  flex-shrink: 0;
  background: linear-gradient(
      140deg,
      var(--cover-color),
      #171a23
  );
  color: #ffffffd9;
}

.cover {
  width: 58px;
  height: 58px;
  border-radius: 12px;
  font-size: 25px;
}

.track-info {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 5px;
  min-width: 0;
}

.track-info strong {
  color: #f5f7fa;
  font-size: 14px;
  overflow-wrap: anywhere;
}

.track-info span,
.track-info small {
  color: #9296a7;
  font-size: 12px;
  overflow-wrap: anywhere;
}

.favorite-button {
  display: grid;
  place-items: center;
  flex-shrink: 0;
  width: 40px;
  height: 40px;
  border: 0;
  border-radius: 10px;
  background: transparent;
  color: #85899a;
  font-size: 21px;
  cursor: pointer;
  transition:
      color 0.2s,
      background 0.2s;
}

.favorite-button:hover:not(:disabled) {
  background: #24202f;
  color: #c4b5fd;
}

.favorite-button.liked {
  color: #a78bfa;
}

.favorite-button:disabled {
  cursor: wait;
  opacity: 0.6;
}

.favorite-button ion-spinner {
  width: 20px;
  height: 20px;
  color: #a78bfa;
}

.collection-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 18px;
}

.collection-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
  color: #f5f7fa;
  font-size: 13px;
}

.album-cover {
  aspect-ratio: 1;
  border-radius: 16px;
  font-size: 42px;
  margin-bottom: 5px;
}

.collection-card span {
  color: #9296a7;
  font-size: 12px;
}

.artist-list {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.artist-row {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 10px;
  border-radius: 12px;
  color: #f5f7fa;
  transition: background 0.2s;
}

.artist-row strong {
  flex: 1;
  min-width: 0;
  font-size: 14px;
}

.artist-row > ion-icon {
  color: #9296a7;
}

.artist-track-count {
  color: #9296a7;
  font-size: 12px;
}

.artist-avatar {
  display: grid;
  place-items: center;
  flex-shrink: 0;
  width: 46px;
  height: 46px;
  border-radius: 50%;
  background: linear-gradient(
      135deg,
      #8b5cf6,
      #292d3b
  );
  color: white;
  font-size: 19px;
  font-weight: 800;
}

.empty-state {
  padding: 55px 15px;
  text-align: center;
  color: #9296a7;
}

.empty-state > ion-icon {
  color: #a78bfa;
  font-size: 40px;
}

.empty-state > ion-spinner {
  color: #a78bfa;
}

.empty-state h3 {
  color: #f5f7fa;
  font-size: 17px;
}

.empty-state p {
  font-size: 13px;
  line-height: 1.6;
}

.retry-button {
  margin-top: 12px;
  padding: 10px 16px;
  border: 0;
  border-radius: 10px;
  background: #8b5cf6;
  color: white;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}

.retry-button:hover {
  background: #7c3aed;
}

@media (max-width: 650px) {
  .library-layout {
    padding: 30px 18px 100px;
  }

  .collection-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .track-row {
    gap: 10px;
    padding: 9px 5px;
  }

  .cover {
    width: 50px;
    height: 50px;
  }
}
</style>