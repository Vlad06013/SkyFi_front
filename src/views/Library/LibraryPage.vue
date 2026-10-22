<template>
  <ion-page>
    <AppNavigation />

    <ion-content
        :fullscreen="true"
        class="library-content"
    >
      <main class="library-layout">
        <!-- Заголовок -->
        <header class="library-header">
          <div class="eyebrow">
            ТВОЯ КОЛЛЕКЦИЯ
          </div>

          <h1>Моя музыка</h1>

          <p class="subtitle">
            Всё любимое — в одном месте
          </p>
        </header>

        <!-- Вкладки -->
        <nav
            class="library-tabs"
            aria-label="Разделы музыкальной коллекции"
        >
          <button
              v-for="tab in tabs"
              :key="tab.value"
              type="button"
              class="tab"
              :class="{ active: activeTab === tab.value }"
              :aria-current="
              activeTab === tab.value ? 'page' : undefined
            "
              @click="activeTab = tab.value"
          >
            <ion-icon
                v-if="tab.icon"
                :icon="tab.icon"
            />

            {{ tab.label }}
          </button>

          <button
              type="button"
              class="tab"
              :class="{ active: activeTab === 'upload' }"
              @click="openUploadedTab"
          >
            <ion-icon :icon="musicalNotesOutline" />
            Загруженное
          </button>

          <button
              type="button"
              class="tab upload-tab"
              @click="openUpload"
          >
            <ion-icon :icon="cloudUploadOutline" />

            Загрузить трек
          </button>
        </nav>

        <!-- =====================================
             ЗАГРУЗКА МУЗЫКИ И МОИ ЗАГРУЗКИ
        ====================================== -->
        <section
            v-if="activeTab === 'upload'"
            class="upload-section"
        >
          <!-- =====================================
               СПИСОК ЗАГРУЖЕННЫХ ТРЕКОВ
          ====================================== -->
          <section class="library-section uploads-section">
            <div class="section-heading">
              <div>
                <div class="section-eyebrow">
                  ТВОЯ МУЗЫКА
                </div>

                <h2>Загруженное</h2>
              </div>

              <span class="count-badge">
                {{ uploadedTracks.length }}
                {{ pluralizeTracks(uploadedTracks.length) }}
              </span>
            </div>

            <!-- Загрузка списка -->
            <div
                v-if="uploadsLoading"
                class="empty-state"
                aria-live="polite"
            >
              <div class="loading-icon">
                <ion-spinner name="crescent" />
              </div>

              <h3>Загружаем твои треки</h3>

              <p>
                Получаем список загруженной музыки...
              </p>
            </div>

            <!-- Ошибка списка -->
            <div
                v-else-if="uploadsError"
                class="empty-state"
                role="alert"
            >
              <div class="empty-icon error-icon">
                <ion-icon :icon="informationCircleOutline" />
              </div>

              <h3>Не удалось загрузить список</h3>

              <p>{{ uploadsError }}</p>

              <button
                  type="button"
                  class="retry-button"
                  @click="loadUploadedTracks"
              >
                <ion-icon :icon="refreshOutline" />

                Повторить
              </button>
            </div>

            <!-- Список -->
            <TrackList
                v-else-if="uploadedTracks.length"
                :tracks="uploadedTracks"
                :is-current-track="isCurrentTrack"
                :is-playing="playerIsPlaying"
                :get-track-color="getTrackColor"
                :is-favorite="isFavoriteTrack"
                :loading-track-id="menuActionLoadingId"
                @play="handleUploadedTrackClick"
                @menu-open="handleTrackMenuOpen"
                @action="runTrackMenuAction"
            />

            <!-- Список пуст -->
            <div
                v-else
                class="empty-state"
            >
              <div class="empty-icon">
                <ion-icon :icon="musicalNotesOutline" />
              </div>

              <h3>Ты пока ничего не загрузил</h3>

              <p>
                Загруженные тобой треки появятся здесь.
                Нажми «Загрузить трек», чтобы добавить свою первую песню.
              </p>
            </div>
          </section>
        </section>

        <!-- =====================================
             ЗАГРУЗКА ИЗБРАННОГО
        ====================================== -->
        <section
            v-else-if="loading"
            class="empty-state"
            aria-live="polite"
        >
          <div class="loading-icon">
            <ion-spinner name="crescent" />
          </div>

          <h3>Загружаем твою коллекцию</h3>

          <p>
            Подготавливаем твою музыку...
          </p>
        </section>

        <!-- =====================================
             ОШИБКА ЗАГРУЗКИ ИЗБРАННОГО
        ====================================== -->
        <section
            v-else-if="error"
            class="empty-state"
            role="alert"
        >
          <div class="empty-icon error-icon">
            <ion-icon :icon="informationCircleOutline" />
          </div>

          <h3>Не удалось загрузить музыку</h3>

          <p>{{ error }}</p>

          <button
              type="button"
              class="retry-button"
              @click="loadLibrary"
          >
            <ion-icon :icon="refreshOutline" />

            Повторить
          </button>
        </section>

        <!-- =====================================
              ИЗБРАННОЕ
         ====================================== -->
        <section
            v-else-if="activeTab === 'tracks'"
            class="library-section"
        >
          <div class="section-heading">
            <div>
              <div class="section-eyebrow">
                ТВОЯ МУЗЫКА
              </div>

              <h2>Избранное</h2>
            </div>

            <span class="count-badge">
              {{ tracks.length }}
              {{ pluralizeTracks(tracks.length) }}
            </span>
          </div>

          <TrackList
              v-if="tracks.length"
              :tracks="tracks"
              :is-current-track="isCurrentTrack"
              :is-playing="playerIsPlaying"
              :get-track-color="getTrackColor"
              :is-favorite="isFavoriteTrack"
              :loading-track-id="menuActionLoadingId"
              @play="handleTrackClick"
              @menu-open="handleTrackMenuOpen"
              @action="runTrackMenuAction"
          />

          <div
              v-else
              class="empty-state"
          >
            <div class="empty-icon">
              <ion-icon :icon="musicalNotesOutline" />
            </div>

            <h3>Избранное пока пусто</h3>

            <p>
              Добавляй понравившиеся треки в избранное,
              чтобы они всегда были под рукой.
            </p>

            <button
                type="button"
                class="retry-button"
                @click="openUpload"
            >
              <ion-icon :icon="cloudUploadOutline" />

              Загрузить музыку
            </button>
          </div>
        </section>

        <!-- =====================================
             АЛЬБОМЫ
        ====================================== -->
        <section
            v-else-if="activeTab === 'albums'"
            class="library-section"
        >
          <div class="section-heading">
            <div>
              <div class="section-eyebrow">
                ТВОИ РЕЛИЗЫ
              </div>

              <h2>Альбомы</h2>
            </div>

            <span class="count-badge">
              {{ albums.length }}
            </span>
          </div>

          <div
              v-if="albums.length"
              class="collection-grid"
          >
            <article
                v-for="album in albums"
                :key="album.id"
                class="collection-card"
            >
              <button
                  type="button"
                  class="album-cover"
                  :style="{
                  '--cover-color': getTrackColor(album.id),
                }"
                  :aria-label="`Альбом ${album.title}`"
                  @click="playAlbum(album)"
              >
                <ion-icon :icon="discOutline" />

                <span class="album-play">
                  <ion-icon :icon="playOutline" />
                </span>
              </button>

              <strong>{{ album.title }}</strong>

              <span>
                {{ album.tracksCount }}
                {{ pluralizeTracks(album.tracksCount) }}
              </span>
            </article>
          </div>

          <div
              v-else
              class="empty-state"
          >
            <div class="empty-icon">
              <ion-icon :icon="discOutline" />
            </div>

            <h3>Альбомов пока нет</h3>

            <p>
              Альбомы появятся, когда ты добавишь
              треки с названием альбома.
            </p>

            <button
                type="button"
                class="retry-button"
                @click="openUpload"
            >
              Добавить музыку
            </button>
          </div>
        </section>

        <!-- =====================================
             ИСПОЛНИТЕЛИ
        ====================================== -->
        <section
            v-else-if="activeTab === 'artists'"
            class="library-section"
        >
          <div class="section-heading">
            <div>
              <div class="section-eyebrow">
                ТВОИ АРТИСТЫ
              </div>

              <h2>Исполнители</h2>
            </div>

            <span class="count-badge">
              {{ artists.length }}
            </span>
          </div>

          <div
              v-if="artists.length"
              class="artist-list"
          >
            <button
                v-for="artist in artists"
                :key="artist.id"
                type="button"
                class="artist-row"
                @click="playArtist(artist.id)"
            >
              <div
                  class="artist-avatar"
                  :style="{
                  '--cover-color': getTrackColor(artist.id),
                }"
              >
                {{ artist.name.slice(0, 1).toUpperCase() }}
              </div>

              <div class="artist-info">
                <strong>{{ artist.name }}</strong>

                <span>
                  {{ artist.tracksCount }}
                  {{ pluralizeTracks(artist.tracksCount) }}
                </span>
              </div>

              <ion-icon
                  class="artist-arrow"
                  :icon="chevronForwardOutline"
              />
            </button>
          </div>

          <div
              v-else
              class="empty-state"
          >
            <div class="empty-icon">
              <ion-icon :icon="peopleOutline" />
            </div>

            <h3>Исполнителей пока нет</h3>

            <p>
              Исполнители появятся после загрузки музыки.
            </p>

            <button
                type="button"
                class="retry-button"
                @click="openUpload"
            >
              Загрузить музыку
            </button>
          </div>
        </section>
      </main>
    </ion-content>

    <ion-modal
        :is-open="uploadModalOpen"
        class="upload-modal"
        style="--width: min(680px, calc(100% - 32px)); --height: auto; --max-height: 90%; --border-radius: 24px;"
        @did-dismiss="uploadModalOpen = false"
    >
      <div class="upload-modal-content" style="position: relative; max-height: 90vh; overflow-y: auto; padding: 28px; color: var(--ion-text-color);">
        <button
            type="button"
            class="upload-modal-close"
            style="position: absolute; top: 18px; right: 18px; border: 0; background: transparent; font-size: 24px; cursor: pointer;"
            aria-label="Закрыть окно"
            :disabled="uploading"
            @click="uploadModalOpen = false"
        >
          <ion-icon :icon="closeOutline" />
        </button>
        <div class="upload-modal-title" style="padding-right: 36px; margin-bottom: 24px;">
          <div class="section-eyebrow">ТВОЙ ЗВУК</div>
          <h2>Загрузить музыку</h2>
          <p>Добавь свою музыку в коллекцию SkyFi.</p>
        </div>
        <!-- Успешная загрузка -->
        <div
            v-if="uploadSuccess"
            class="upload-message success-message"
            role="status"
        >
          <ion-icon :icon="checkmarkCircleOutline" />

          <div>
            <strong>Трек успешно загружен!</strong>

            <p>
              Музыка добавлена в твою коллекцию.
            </p>
          </div>
        </div>

        <!-- Ошибка загрузки -->
        <div
            v-if="uploadError"
            class="upload-message error-message"
            role="alert"
        >
          <ion-icon :icon="alertCircleOutline" />

          <div>
            <strong>Не удалось загрузить трек</strong>

            <p>{{ uploadError }}</p>
          </div>
        </div>

        <!-- Форма загрузки -->
        <form
            class="upload-form"
            @submit.prevent="uploadTrack"
        >
          <!-- Название -->
          <div class="form-field">
            <label for="track-title">
              Название трека

              <span class="required">*</span>
            </label>

            <input
                id="track-title"
                v-model.trim="uploadForm.title"
                type="text"
                maxlength="255"
                placeholder="Например, My New Song"
                autocomplete="off"
                required
                :disabled="uploading"
                :aria-invalid="Boolean(fieldErrors.title)"
            />

            <p
                v-if="fieldErrors.title"
                class="field-error"
            >
              {{ fieldErrors.title }}
            </p>
          </div>

          <!-- Исполнитель -->
          <div class="form-field">
            <label for="track-artist">
              Исполнитель

              <span class="required">*</span>
            </label>

            <input
                id="track-artist"
                v-model.trim="uploadForm.artist_name"
                type="text"
                maxlength="255"
                placeholder="Имя исполнителя или название группы"
                autocomplete="off"
                required
                :disabled="uploading"
                :aria-invalid="Boolean(fieldErrors.artist_name)"
            />

            <p
                v-if="fieldErrors.artist_name"
                class="field-error"
            >
              {{ fieldErrors.artist_name }}
            </p>
          </div>

          <!-- Альбом -->
          <div class="form-field">
            <label for="track-album">
              Альбом

              <span class="optional">
                (необязательно)
              </span>
            </label>

            <input
                id="track-album"
                v-model.trim="uploadForm.album_title"
                type="text"
                maxlength="255"
                placeholder="Название альбома"
                autocomplete="off"
                :disabled="uploading"
                :aria-invalid="Boolean(fieldErrors.album_title)"
            />

            <p
                v-if="fieldErrors.album_title"
                class="field-error"
            >
              {{ fieldErrors.album_title }}
            </p>
          </div>

          <!-- Жанр -->
          <div class="form-field">
            <label for="track-genre">
              Жанр

              <span class="required">*</span>
            </label>

            <input
                id="track-genre"
                v-model.trim="uploadForm.genre_name"
                type="text"
                maxlength="100"
                placeholder="Например, Rock, Metal, Electronic"
                autocomplete="off"
                required
                :disabled="uploading"
                :aria-invalid="Boolean(fieldErrors.genre_name)"
            />

            <p
                v-if="fieldErrors.genre_name"
                class="field-error"
            >
              {{ fieldErrors.genre_name }}
            </p>
          </div>

          <!-- Описание -->
          <div class="form-field">
            <label for="track-description">
              Описание

              <span class="optional">
                (необязательно)
              </span>
            </label>

            <textarea
                id="track-description"
                v-model.trim="uploadForm.description"
                maxlength="5000"
                rows="4"
                placeholder="Расскажи немного о треке..."
                :disabled="uploading"
                :aria-invalid="Boolean(fieldErrors.description)"
            />

            <p
                v-if="fieldErrors.description"
                class="field-error"
            >
              {{ fieldErrors.description }}
            </p>
          </div>

          <!-- Аудиофайл -->
          <div class="form-field">
            <label for="track-audio">
              Аудиофайл

              <span class="required">*</span>
            </label>

            <label
                class="file-dropzone"
                :class="{
                'file-selected': selectedFile,
                'file-disabled': uploading,
                'file-invalid': Boolean(fieldErrors.audio),
              }"
                for="track-audio"
            >
              <input
                  id="track-audio"
                  ref="fileInput"
                  type="file"
                  accept=".mp3,.wav,.ogg,.flac,.m4a,.aac,audio/*"
                  required
                  :disabled="uploading"
                  @change="handleFileChange"
              />

              <div class="file-icon">
                <ion-icon
                    :icon="
                    selectedFile
                      ? musicalNotesOutline
                      : cloudUploadOutline
                  "
                />
              </div>

              <template v-if="selectedFile">
                <strong class="file-name">
                  {{ selectedFile.name }}
                </strong>

                <span class="file-meta">
                  {{ formatFileSize(selectedFile.size) }}
                </span>

                <span class="file-hint">
                  Нажми, чтобы выбрать другой файл
                </span>
              </template>

              <template v-else>
                <strong>
                  Выбери аудиофайл
                </strong>

                <span class="file-meta">
                  MP3, WAV, OGG, FLAC, M4A, AAC
                </span>

                <span class="file-hint">
                  Максимальный размер зависит от настроек сервера
                </span>
              </template>
            </label>

            <p
                v-if="fieldErrors.audio"
                class="field-error"
            >
              {{ fieldErrors.audio }}
            </p>
          </div>

          <!-- Кнопки формы -->
          <div class="upload-actions">
            <button
                type="button"
                class="cancel-button"
                :disabled="uploading"
                @click="resetUploadForm"
            >
              <ion-icon :icon="refreshOutline" />

              Очистить
            </button>

            <button
                type="submit"
                class="submit-button"
                :disabled="uploading || !selectedFile"
            >
              <ion-spinner
                  v-if="uploading"
                  name="crescent"
              />

              <ion-icon
                  v-else
                  :icon="cloudUploadOutline"
              />

              <span>
                {{
                  uploading
                      ? 'Загружаем...'
                      : 'Загрузить трек'
                }}
              </span>
            </button>
          </div>
        </form>

      </div>
    </ion-modal>

    <AudioPlayer />
  </ion-page>
</template>

<script setup lang="ts">
import './library.css';

import { useLibrary } from './library';
import {
  IonContent,
  IonPage,
  IonIcon,
  IonSpinner,
  IonModal,
} from '@ionic/vue';

import {
  musicalNotesOutline,
  discOutline,
  cloudUploadOutline,
  checkmarkCircleOutline,
  alertCircleOutline,
  informationCircleOutline,
  chevronForwardOutline,
  refreshOutline,
  playOutline,
  pauseOutline,
  peopleOutline,
  closeOutline,
  ellipsisVerticalOutline,
  playSkipForwardOutline,
  listOutline,
  heartOutline,
} from 'ionicons/icons';

import AudioPlayer from '@/components/player/AudioPlayer.vue';
import AppNavigation from '@/components/AppNavigation.vue';
import TrackList from '@/components/tracks/TrackList.vue';

import { addFavorite, removeFavorite, checkFavorite } from '@/api/favorites';
import type { Track } from '@/api/tracks';
import usePlayerStore from '@/stores/player';
import { ref, watch } from 'vue';

const uploadModalOpen = ref(false);
const openMenuTrackId = ref<string | null>(null);
const menuActionLoadingId = ref<number | null>(null);
const favoriteTrackIds = ref<Set<number>>(new Set());
const player = usePlayerStore();

const {
  tabs,
  activeTab,

  // Избранное
  tracks,
  loading,
  error,
  loadLibrary,

  // Собственные загрузки
  uploadedTracks,
  uploadsLoading,
  uploadsError,
  loadUploadedTracks,

  // Форма загрузки
  uploadSuccess,
  uploadError,
  uploadForm,
  uploading,
  fieldErrors,
  selectedFile,
  fileInput,

  handleFileChange,
  formatFileSize,
  resetUploadForm,
  uploadTrack,

  // Коллекции
  albums,
  artists,

  // Плеер
  isCurrentTrack,
  playerIsPlaying,
  playTrack,
  playUploadedTrack,
  playAlbum,
  playArtist,

  // Оформление
  getTrackColor,
  pluralizeTracks,
} = useLibrary();


function isFavoriteTrack(track: Track): boolean {
  const id = Number(track.id);
  return tracks.value.some(item => Number(item.id) === id) || favoriteTrackIds.value.has(id);
}

async function handleTrackMenuOpen(track: Track): Promise<void> {
  const trackId = Number(track.id);

  if (!Number.isFinite(trackId) || trackId <= 0) {
    return;
  }

  try {
    const result = await checkFavorite(trackId);
    const next = new Set(favoriteTrackIds.value);

    if (result.is_favorite) {
      next.add(trackId);
    } else {
      next.delete(trackId);
    }

    favoriteTrackIds.value = next;
  } catch (error) {
    console.error(
        '[Library.vue] Не удалось проверить избранное:',
        error,
    );
  }
}

function toggleTrackMenu(track: Track): void {
  const id = String(track.id);
  openMenuTrackId.value = openMenuTrackId.value === id ? null : id;
  if (openMenuTrackId.value === id) {
    void checkFavorite(Number(track.id))
        .then(result => {
          const next = new Set(favoriteTrackIds.value);
          if (result.is_favorite) next.add(Number(track.id));
          else next.delete(Number(track.id));
          favoriteTrackIds.value = next;
        })
        .catch(error => console.error('[Library.vue] Не удалось проверить избранное:', error));
  }
}

async function runTrackMenuAction(track: Track, action: 'next' | 'queue' | 'favorite'): Promise<void> {
  const trackId = Number(track.id);
  if (!Number.isFinite(trackId) || trackId <= 0 || menuActionLoadingId.value !== null) return;

  // Закрываем меню сразу по нажатию, чтобы повторный клик не попадал в него
  // и не запускал действие несколько раз.
  openMenuTrackId.value = null;
  menuActionLoadingId.value = trackId;
  try {
    if (action === 'next') {
      await player.playTrackNext(track);
    } else if (action === 'queue') {
      await player.addToQueue(track);
    } else if (action === 'favorite') {
      const favorite = await checkFavorite(trackId);
      if (favorite.is_favorite) {
        await removeFavorite(trackId);
        const next = new Set(favoriteTrackIds.value);
        next.delete(trackId);
        favoriteTrackIds.value = next;
      } else {
        await addFavorite(trackId);
        const next = new Set(favoriteTrackIds.value);
        next.add(trackId);
        favoriteTrackIds.value = next;
      }
      await loadLibrary();
    }
  } catch (error) {
    console.error('[Library.vue] Не удалось выполнить действие с треком:', error);
  } finally {
    menuActionLoadingId.value = null;
    openMenuTrackId.value = null;
  }
}

async function openUploadedTab(): Promise<void> {
  activeTab.value = 'upload';
  // Запрашиваем список при каждом переходе во вкладку «Загруженное».
  await loadUploadedTracks();
}

function openUpload(): void {
  // Форма открывается отдельно и не подменяет загрузку списка.
  uploadModalOpen.value = true;
}

watch(uploadSuccess, async (success) => {
  if (success) {
    await loadUploadedTracks();
    activeTab.value = 'upload';
    uploadModalOpen.value = false;
  }
});

/**
 * Воспроизведение трека из избранного.
 *
 * Функция находится в useLibrary(), чтобы очередь
 * и сам плеер использовали единый сценарий.
 */
async function handleTrackClick(track: Track): Promise<void> {
  console.log('[Library.vue] Нажат трек из избранного:', track);

  if (!track || track.id === undefined || track.id === null) {
    console.error(
        '[Library.vue] Нельзя воспроизвести трек без ID:',
        track,
    );

    return;
  }

  try {
    await playTrack(track, tracks.value);
  } catch (error: unknown) {
    console.error(
        '[Library.vue] Ошибка воспроизведения избранного:',
        error,
    );
  }
}

/**
 * Воспроизведение трека, загруженного пользователем.
 */
async function handleUploadedTrackClick(
    track: Track,
): Promise<void> {
  console.log('[Library.vue] Нажат загруженный трек:', track);

  if (!track || track.id === undefined || track.id === null) {
    console.error(
        '[Library.vue] Нельзя воспроизвести загруженный трек без ID:',
        track,
    );

    return;
  }

  try {
    await playUploadedTrack(track);
  } catch (error: unknown) {
    console.error(
        '[Library.vue] Ошибка воспроизведения загруженного трека:',
        error,
    );
  }
}
</script>

<style scoped>
.track-menu-wrap { position: relative; z-index: 2; flex: 0 0 auto; }
.track-menu-trigger { display: inline-flex; align-items: center; justify-content: center; width: 38px; height: 38px; border: 0; border-radius: 50%; background: transparent; color: var(--ion-color-medium, #888); cursor: pointer; transition: background .18s ease, color .18s ease; }
.track-menu-trigger:hover, .track-menu-trigger:focus-visible { background: var(--ion-color-step-100, rgba(128,128,128,.14)); color: var(--ion-text-color); outline: none; }
.track-menu-trigger ion-icon { font-size: 21px; }
.track-context-menu { position: absolute; z-index: 10000; pointer-events: auto; touch-action: manipulation; top: calc(100% + 5px); right: 0; width: 238px; padding: 6px; border: 1px solid var(--ion-color-step-150, rgba(128,128,128,.2)); border-radius: 14px; background: var(--ion-background-color, #fff); box-shadow: 0 12px 34px rgba(0,0,0,.2); }
.track-context-menu button { display: flex; align-items: center; gap: 11px; width: 100%; min-height: 42px; padding: 10px 12px; border: 0; border-radius: 9px; background: transparent; color: var(--ion-text-color); font: inherit; font-size: 14px; text-align: left; cursor: pointer; }
.track-context-menu button:hover, .track-context-menu button:focus-visible { background: var(--ion-color-step-100, rgba(128,128,128,.12)); outline: none; }
.track-context-menu button:disabled { opacity: .55; cursor: wait; }
.track-context-menu button ion-icon { flex: 0 0 auto; font-size: 18px; color: var(--ion-color-medium, #888); }
.track-row { position: relative; z-index: 0; overflow: visible; }
.track-row.track-row-menu-open { z-index: 1000; }
.track-list { overflow: visible; }
@media (max-width: 600px) { .track-context-menu { position: absolute; top: calc(100% + 5px); right: 0; width: min(260px, calc(100vw - 32px)); } }
</style>