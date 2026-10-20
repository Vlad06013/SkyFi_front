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
              class="tab upload-tab"
              :class="{ active: activeTab === 'upload' }"
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
          <!-- Заголовок загрузчика -->
          <div class="upload-heading">
            <div>
              <div class="section-eyebrow">
                ТВОЙ ЗВУК
              </div>

              <h2>Загрузить музыку</h2>

              <p>
                Добавь свою музыку в коллекцию SkyFi.
              </p>
            </div>

            <div class="upload-heading-icon">
              <ion-icon :icon="cloudUploadOutline" />
            </div>
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

          <!-- =====================================
               СПИСОК ЗАГРУЖЕННЫХ ТРЕКОВ
          ====================================== -->
          <section class="library-section uploads-section">
            <div class="section-heading">
              <div>
                <div class="section-eyebrow">
                  ТВОЯ МУЗЫКА
                </div>

                <h2>Мои загрузки</h2>
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
            <div
                v-else-if="uploadedTracks.length"
                class="track-list"
            >
              <div
                  v-for="track in uploadedTracks"
                  :key="track.id"
                  class="track-row"
                  :class="{
      'track-row-active': isCurrentTrack(track),
    }"
                  style="cursor: pointer"
                  @click="playUploadedTrack(track)"
              >

              <!-- Кнопка воспроизведения -->
                <button
                    type="button"
                    class="uploaded-track-play"
                    :aria-label="`Воспроизвести ${track.title}`"
                    @click="handleUploadedTrackClick(track)"
                >
                  <div
                      class="cover"
                      :style="{
                      '--cover-color': getTrackColor(track.id),
                    }"
                  >
                    <ion-icon :icon="musicalNotesOutline" />

                    <span class="cover-play">
                      <ion-icon
                          :icon="
                          isCurrentTrack(track) && playerIsPlaying
                            ? pauseOutline
                            : playOutline
                        "
                      />
                    </span>
                  </div>
                </button>

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

                <!-- Индикатор воспроизведения -->
                <span
                    v-if="isCurrentTrack(track)"
                    class="playing-indicator"
                    aria-label="Сейчас воспроизводится"
                >
                  <span />
                  <span />
                  <span />
                </span>

                <!-- Добавление в очередь -->
                <button
                    type="button"
                    class="queue-button"
                    :disabled="
                    queueLoadingTrackId === Number(track.id)
                  "
                    :aria-label="`Добавить ${track.title} в очередь`"
                    title="Добавить в очередь"
                    @click="addTrackToQueueFromLibrary(track)"
                >
                  <ion-spinner
                      v-if="
                      queueLoadingTrackId === Number(track.id)
                    "
                      name="crescent"
                  />

                  <ion-icon
                      v-else
                      :icon="addOutline"
                  />
                </button>
              </div>
            </div>

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
                Заполни форму выше и добавь свою первую песню.
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

          <div
              v-if="tracks.length"
              class="track-list"
          >
            <<div
              v-for="track in tracks"
              :key="track.id"
              class="track-row"
              :class="{
                'track-row-active': isCurrentTrack(track),
              }"
              @click="handleTrackClick(track)"
              style="cursor: pointer"
          >
            <button
                type="button"
                class="uploaded-track-play"
                :aria-label="`Воспроизвести ${track.title}`"
            >
                <div
                    class="cover"
                    :style="{
                    '--cover-color': getTrackColor(track.id),
                  }"
                >
                  <ion-icon :icon="musicalNotesOutline" />

                  <span class="cover-play">
                    <ion-icon
                        :icon="
                        isCurrentTrack(track) && playerIsPlaying
                          ? pauseOutline
                          : playOutline
                      "
                    />
                  </span>
                </div>
              </button>

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

              <span
                  v-if="isCurrentTrack(track)"
                  class="playing-indicator"
                  aria-label="Сейчас воспроизводится"
              >
                <span />
                <span />
                <span />
              </span>

              <button
                  type="button"
                  class="queue-button"
                  :disabled="
                  queueLoadingTrackId === Number(track.id)
                "
                  :aria-label="`Добавить ${track.title} в очередь`"
                  title="Добавить в очередь"
                  @click="addTrackToQueueFromLibrary(track)"
              >
                <ion-spinner
                    v-if="
                    queueLoadingTrackId === Number(track.id)
                  "
                    name="crescent"
                />

                <ion-icon
                    v-else
                    :icon="addOutline"
                />
              </button>
            </div>
          </div>

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
  addOutline,
} from 'ionicons/icons';

import AudioPlayer from '@/components/player/AudioPlayer.vue';
import AppNavigation from '@/components/AppNavigation.vue';

import type { Track } from '@/api/tracks';

const {
  tabs,
  activeTab,
  openUpload,

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

  // Очередь
  addTrackToQueueFromLibrary,
  queueLoadingTrackId,

  // Оформление
  getTrackColor,
  pluralizeTracks,
} = useLibrary();

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