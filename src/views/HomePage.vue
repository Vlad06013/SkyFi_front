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

            <!-- Поиск -->
            <div class="search">
              <span>⌕</span>

              <input
                  v-model="search"
                  placeholder="Найти музыку..."
                  type="search"
              />

              <kbd>⌘ K</kbd>
            </div>

            <!-- Меню пользователя -->
            <div class="profile-menu">
              <button
                  class="profile-button"
                  aria-label="Открыть меню профиля"
                  :aria-expanded="profileMenuOpen"
                  aria-haspopup="true"
                  :disabled="loggingOut"
                  @click.stop="profileMenuOpen = !profileMenuOpen"
              >
                {{ auth.user?.name?.charAt(0).toUpperCase() ?? 'U' }}

                <span class="profile-chevron">⌄</span>
              </button>

              <div
                  v-if="profileMenuOpen"
                  class="profile-dropdown"
                  role="menu"
              >
                <div class="profile-info">
                  <div class="profile-name">
                    {{ auth.user?.name ?? 'Пользователь' }}
                  </div>

                  <div class="profile-email">
                    {{ auth.user?.email ?? '' }}
                  </div>
                </div>

                <div class="dropdown-divider"></div>

                <button
                    class="dropdown-item"
                    role="menuitem"
                    @click="openProfile"
                >
                  <span>♙</span>
                  Мой профиль
                </button>

                <button
                    class="dropdown-item"
                    role="menuitem"
                    @click="openLibrary"
                >
                  <span>♫</span>
                  Моя музыка
                </button>

                <div class="dropdown-divider"></div>

                <div v-if="logoutError" class="logout-error">
                  {{ logoutError }}
                </div>

                <button
                    class="dropdown-item logout-item"
                    role="menuitem"
                    :disabled="loggingOut"
                    @click="logout"
                >
                  <span>↪</span>

                  {{
                    loggingOut
                        ? 'Выходим...'
                        : 'Выйти из аккаунта'
                  }}
                </button>
              </div>
            </div>
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

              <!-- Загрузка -->
              <div
                  v-if="tracksLoading || (search.trim() && externalSearchLoading)"
                  class="empty-state"
              >
                {{
                  externalSearchLoading && search.trim()
                      ? 'Ищем музыку...'
                      : 'Загружаем треки...'
                }}
              </div>

              <!-- Ошибка внешнего поиска -->
              <div
                  v-else-if="search.trim() && externalSearchError"
                  class="empty-state"
              >
                <p>{{ externalSearchError }}</p>

                <button
                    @click="performExternalSearch(search.trim())"
                >
                  Повторить поиск
                </button>
              </div>

              <!-- Ошибка загрузки локальных треков -->
              <div
                  v-else-if="!search.trim() && tracksError"
                  class="empty-state"
              >
                {{ tracksError }}

                <button @click="$router.go(0)">
                  Повторить
                </button>
              </div>

              <!-- Внешние результаты Internet Archive -->
              <div
                  v-else-if="search.trim() && externalTracks.length"
                  class="track-grid"
              >
                <button
                    v-for="track in externalTracks"
                    :key="track.id"
                    class="track-card"
                    type="button"
                    @click="playExternalTrack(track)"
                >
                  <span class="cover cover-purple">
                    <span class="cover-symbol">♫</span>
                    <span class="cover-play">▶</span>
                  </span>

                                  <span class="track-title">
                    {{ track.title }}
                  </span>

                                  <span class="track-artist">
                    {{ track.artist || 'Неизвестный исполнитель' }}
                  </span>
                </button>
              </div>

              <!-- Локальные треки SkyFi -->
              <div
                  v-else-if="!search.trim() && filteredTracks.length"
                  class="track-grid"
              >
                <button
                    v-for="track in filteredTracks"
                    :key="track.id"
                    class="track-card"
                    type="button"
                    @click="'artists' in track
                      ? playTrack(track)
                      : playExternalTrack(track)"
                >
                  <span class="cover cover-purple">
                    <span class="cover-symbol">♫</span>
                    <span class="cover-play">▶</span>
                  </span>

                  <span class="track-title">
                    {{ track.title }}
                  </span>

                  <span class="track-artist">
                    {{
                      'artists' in track
                          ? track.artists
                          .map(artist => artist.name)
                          .join(', ') || 'Неизвестный исполнитель'
                          : track.artist || 'Неизвестный исполнитель'
                    }}
</span>
                </button>
              </div>

              <!-- Ничего не найдено -->
              <div
                  v-else
                  class="empty-state"
              >
                {{
                  search.trim()
                      ? 'Ничего не найдено. Попробуй другой запрос.'
                      : 'Пока нет доступных треков.'
                }}
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
      <footer class="player">
        <div class="now-playing">
          <div
              v-if="currentTrack"
              class="mini-cover"
              :class="currentTrack.cover"
          >
            {{ currentTrack.symbol }}
          </div>

          <div
              v-else
              class="mini-cover mini-empty"
          >
            ♫
          </div>

          <div class="now-info">
            <strong>
              {{ currentTrack?.title ?? 'Выбери свой трек' }}
            </strong>

            <span>
              {{
                currentTrack?.artist
                ?? 'SkyFi · музыкальное пространство'
              }}
            </span>
          </div>

          <button
              class="heart-button"
              :class="{ liked }"
              :aria-label="
                liked
                  ? 'Удалить из избранного'
                  : 'Добавить в избранное'
              "
                          :aria-pressed="liked"
                          :disabled="
                favoriteLoading ||
                !currentTrack ||
                typeof currentTrack.id !== 'number'
              "
                          @click="toggleFavorite"
                      >
            {{ liked ? '♥' : '♡' }}
          </button>

        </div>

        <div class="player-center">
          <div class="player-controls">
            <button
                aria-label="Предыдущий трек"
                @click="nextTrack(-1)"
            >
              |◀
            </button>

            <button
                class="play-button"
                aria-label="Воспроизведение"
                @click="togglePlay"
            >
              {{ isPlaying ? 'Ⅱ' : '▶' }}
            </button>

            <button
                aria-label="Следующий трек"
                @click="nextTrack(1)"
            >
              ▶|
            </button>
          </div>

          <div class="progress-row">
            <span>{{ formatTime(progress) }}</span>

            <input
                class="progress"
                aria-label="Позиция воспроизведения"
                type="range"
                min="0"
                :max="audioDuration || 1"
                step="0.1"
                v-model.number="progress"
                :style="{
      '--range-progress': `${audioDuration > 0
        ? (progress / audioDuration) * 100
        : 0}%`
    }"
                @pointerdown="isSeeking = true"
                @change="seekAudio(); isSeeking = false"
            />

            <span>{{ formatTime(audioDuration) }}</span>
          </div>
        </div>

        <div class="player-right">
          <span>♫</span>

          <input
              aria-label="Громкость"
              type="range"
              min="0"
              max="100"
              step="1"
              v-model.number="volume"
              :style="{
      '--range-progress': `${volume}%`
    }"
          />
        </div>
      </footer>

      <!-- Мобильная навигация -->
      <nav class="mobile-nav">
        <button
            v-for="item in menu.slice(0, 4)"
            :key="item.id"
            :class="{ active: activeMenu === item.id }"
            @click="navigateTo(item.id)"
        >
          <span>{{ item.icon }}</span>
          <small>{{ item.label }}</small>
        </button>
      </nav>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { useRouter } from 'vue-router';

import {
  IonContent,
  IonPage,
} from '@ionic/vue';

import {
  getTracks,
  getTrackAudio,
  searchExternalTracks,
  addFavorite,
  removeFavorite,
  checkFavorite,
  type Track as ApiTrack,
  type ExternalTrack,
} from '@/api/tracks';

import { useAuthStore } from '@/stores/auth';

import {
  computed,
  ref,
  watch,
  onMounted,
  onBeforeUnmount,
} from 'vue';

// ============================================
// РОУТЕР И АВТОРИЗАЦИЯ
// ============================================

const router = useRouter();
const auth = useAuthStore();

// ============================================
// ТИПЫ
// ============================================

type PlayerTrack = {
  id: string | number;
  title: string;
  artist: string;
  cover?: string;
  symbol?: string;
  tag?: string;
  audioUrl?: string;
  archiveIdentifier?: string;
};

// ============================================
// МЕНЮ
// ============================================

const menu = [
  { id: 'home', icon: '⌂', label: 'Главная' },
  { id: 'search', icon: '⌕', label: 'Поиск' },
  { id: 'library', icon: '♫', label: 'Моя музыка' },
  { id: 'playlists', icon: '▤', label: 'Плейлисты' },
];

const activeMenu = ref('home');

// ============================================
// СОСТОЯНИЕ ПРИЛОЖЕНИЯ
// ============================================

const search = ref('');

const currentTrack = ref<PlayerTrack | null>(null);

const isPlaying = ref(false);

const liked = ref(false);

const favoriteLoading = ref(false);

const progress = ref(0);

const audioDuration = ref(0);

const isSeeking = ref(false);

const seekPosition = ref(0);

const volume = ref(70);

// Используется, чтобы устаревший ответ сервера
// не перезаписывал состояние сердечка нового трека.

let favoriteRequestId = 0;

// ============================================
// АУДИОПЛЕЕР
// ============================================

const audio = new Audio();

audio.preload = 'metadata';

audio.volume = volume.value / 100;

// Изменение громкости.

watch(volume, (value) => {
  audio.volume = Math.max(0, Math.min(100, value)) / 100;
});

// ============================================
// СПИСКИ ТРЕКОВ
// ============================================

const tracks = ref<ApiTrack[]>([]);

const tracksLoading = ref(false);

const tracksError = ref('');

const externalTracks = ref<ExternalTrack[]>([]);

const externalSearchLoading = ref(false);

const externalSearchError = ref('');

// Если пользователь ввёл поисковый запрос,
// показываем результаты Internet Archive.
// Иначе показываем каталог SkyFi.

const filteredTracks = computed(() => {
  if (search.value.trim()) {
    return externalTracks.value;
  }

  return tracks.value;
});

// ============================================
// ПОИСК МУЗЫКИ
// ============================================

let searchTimeout: ReturnType<typeof setTimeout> | undefined;

let searchRequestId = 0;

async function performExternalSearch(query: string) {
  const requestId = ++searchRequestId;

  externalSearchLoading.value = true;

  externalSearchError.value = '';

  try {
    const response = await searchExternalTracks(query, 20);

    // Не применяем устаревшие результаты.

    if (requestId !== searchRequestId) {
      return;
    }

    externalTracks.value = response.data;
  } catch (error) {
    if (requestId !== searchRequestId) {
      return;
    }

    console.error(
        'Ошибка поиска Internet Archive:',
        error,
    );

    externalSearchError.value =
        'Не удалось выполнить поиск музыки';

    externalTracks.value = [];
  } finally {
    if (requestId === searchRequestId) {
      externalSearchLoading.value = false;
    }
  }
}

watch(search, (value) => {
  if (searchTimeout) {
    clearTimeout(searchTimeout);
  }

  const query = value.trim();

  if (!query) {
    externalTracks.value = [];

    externalSearchError.value = '';

    externalSearchLoading.value = false;

    // Инвалидируем предыдущие запросы.

    searchRequestId++;

    return;
  }

  searchTimeout = setTimeout(() => {
    void performExternalSearch(query);
  }, 400);
});

// ============================================
// ИЗБРАННОЕ: ПРОВЕРКА СОСТОЯНИЯ
// ============================================

/**
 * Проверяет, добавлен ли локальный трек в избранное.
 *
 * Внешние треки Internet Archive пока не поддерживаются,
 * потому что их идентификаторы не принадлежат таблице tracks.
 */

async function updateFavoriteState(
    track: ApiTrack | null,
): Promise<void> {
  const requestId = ++favoriteRequestId;

  // По умолчанию трек не в избранном.

  liked.value = false;

  if (!track) {
    return;
  }

  try {
    const response = await checkFavorite(track.id);

    // Пользователь мог переключить трек,
    // пока сервер обрабатывал запрос.

    if (requestId !== favoriteRequestId) {
      return;
    }

    // Проверяем, что выбран всё ещё тот же трек.

    if (
        !currentTrack.value ||
        currentTrack.value.id !== track.id
    ) {
      return;
    }

    liked.value = response.is_favorite;
  } catch (error) {
    if (requestId !== favoriteRequestId) {
      return;
    }

    liked.value = false;

    console.error(
        'Не удалось проверить избранное:',
        error,
    );
  }
}

// ============================================
// ИЗБРАННОЕ: ДОБАВЛЕНИЕ И УДАЛЕНИЕ
// ============================================

/**
 * Добавляет или удаляет текущий локальный трек
 * из избранного авторизованного пользователя.
 *
 * Сервер самостоятельно определяет пользователя
 * через auth:sanctum.
 */

async function toggleFavorite(): Promise<void> {
  const track = currentTrack.value;

  if (!track || favoriteLoading.value) {
    return;
  }

  // Внешние треки имеют строковый ID.
  // API избранного принимает только ID локальных треков.

  if (typeof track.id !== 'number') {
    console.info(
        'Избранное доступно для треков из каталога SkyFi.',
    );

    return;
  }

  // Не отправляем запросы без авторизации.

  if (!auth.user) {
    console.warn(
        'Для работы с избранным необходимо авторизоваться.',
    );

    return;
  }

  const trackId = track.id;

  // Запоминаем состояние до запроса.

  const wasLiked = liked.value;

  favoriteLoading.value = true;

  try {
    if (wasLiked) {
      await removeFavorite(trackId);
    } else {
      await addFavorite(trackId);
    }

    // Не изменяем состояние другого трека,
    // если пользователь переключился во время запроса.

    if (
        currentTrack.value &&
        currentTrack.value.id === trackId
    ) {
      liked.value = !wasLiked;
    }
  } catch (error) {
    console.error(
        'Ошибка изменения избранного:',
        error,
    );

    // Состояние liked не изменяем при ошибке:
    // оно останется таким, каким было до запроса.
  } finally {
    favoriteLoading.value = false;
  }
}

// ============================================
// ОБРАБОТЧИКИ АУДИО
// ============================================

/**
 * Обновляет текущую позицию воспроизведения.
 *
 * Во время перемотки не перезаписываем позицию
 * значением audio.currentTime.
 */

function handleTimeUpdate(): void {
  if (isSeeking.value) {
    return;
  }

  if (!Number.isFinite(audio.currentTime)) {
    return;
  }

  progress.value = audio.currentTime;
}

/**
 * Обрабатывает загрузку метаданных нового трека.
 */

function handleLoadedMetadata(): void {
  audioDuration.value =
      Number.isFinite(audio.duration) && audio.duration > 0
          ? audio.duration
          : 0;

  if (!isSeeking.value) {
    progress.value = audio.currentTime || 0;
  }
}

/**
 * Обновляет длительность, если браузер её уточнил.
 */

function handleDurationChange(): void {
  audioDuration.value =
      Number.isFinite(audio.duration) && audio.duration > 0
          ? audio.duration
          : 0;
}

function handlePlay(): void {
  isPlaying.value = true;
}

function handlePause(): void {
  isPlaying.value = false;
}

function handleEnded(): void {
  isPlaying.value = false;

  progress.value = audioDuration.value;
}

// Регистрируем обработчики аудио.

audio.addEventListener(
    'timeupdate',
    handleTimeUpdate,
);

audio.addEventListener(
    'loadedmetadata',
    handleLoadedMetadata,
);

audio.addEventListener(
    'durationchange',
    handleDurationChange,
);

audio.addEventListener(
    'play',
    handlePlay,
);

audio.addEventListener(
    'pause',
    handlePause,
);

audio.addEventListener(
    'ended',
    handleEnded,
);

// ============================================
// ЗАГРУЗКА ТРЕКОВ SKYFI
// ============================================

async function loadTracks(): Promise<void> {
  tracksLoading.value = true;

  tracksError.value = '';

  try {
    const response = await getTracks();

    tracks.value = response.data;

    console.log(
        'Загруженные треки SkyFi:',
        tracks.value,
    );
  } catch (error) {
    console.error(
        'Ошибка загрузки треков:',
        error,
    );

    tracksError.value = 'Не удалось загрузить треки';
  } finally {
    tracksLoading.value = false;
  }
}

// ============================================
// ПРОФИЛЬ
// ============================================

const profileMenuOpen = ref(false);

const loggingOut = ref(false);

const logoutError = ref('');

// ============================================
// НАВИГАЦИЯ
// ============================================

function navigateTo(id: string): void {
  const paths: Record<string, string> = {
    home: '/home',
    search: '/search',
    library: '/library',
    playlists: '/playlists',
  };

  const path = paths[id];

  if (!path) {
    return;
  }

  activeMenu.value = id;

  profileMenuOpen.value = false;

  logoutError.value = '';

  void router.push(path);
}

function openProfile(): void {
  profileMenuOpen.value = false;

  logoutError.value = '';

  void router.push('/profile');
}

function openLibrary(): void {
  navigateTo('library');
}

// ============================================
// ВЫХОД ИЗ АККАУНТА
// ============================================

async function logout(): Promise<void> {
  if (loggingOut.value) {
    return;
  }

  loggingOut.value = true;

  logoutError.value = '';

  try {
    await auth.logout();

    profileMenuOpen.value = false;

    await router.replace('/login');
  } catch (error) {
    console.error(
        'Ошибка выхода из аккаунта:',
        error,
    );

    logoutError.value =
        'Не удалось выйти. Попробуй ещё раз.';
  } finally {
    loggingOut.value = false;
  }
}

// ============================================
// УПРАВЛЕНИЕ ПРОФИЛЕМ
// ============================================

function handleDocumentClick(event: MouseEvent): void {
  const target = event.target;

  if (!(target instanceof Element)) {
    return;
  }

  if (!target.closest('.profile-menu')) {
    profileMenuOpen.value = false;
  }
}

function handleEscape(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    profileMenuOpen.value = false;
  }
}

// ============================================
// ВОСПРОИЗВЕДЕНИЕ АУДИО
// ============================================

async function playAudio(url: string): Promise<void> {
  if (!url) {
    console.warn(
        'Не указана ссылка на аудиофайл',
    );

    return;
  }

  // Останавливаем предыдущий трек.

  audio.pause();

  // Сбрасываем состояние перемотки.

  isSeeking.value = false;

  seekPosition.value = 0;

  progress.value = 0;

  audioDuration.value = 0;

  // Устанавливаем новый аудиофайл.

  audio.src = url;

  audio.volume = volume.value / 100;

  try {
    await audio.play();
  } catch (error) {
    console.error(
        'Ошибка воспроизведения:',
        error,
    );

    isPlaying.value = false;
  }
}

// ============================================
// ВОСПРОИЗВЕДЕНИЕ ВНЕШНИХ ТРЕКОВ
// ============================================

async function playExternalTrack(
    track: ExternalTrack,
): Promise<void> {
  // Инвалидируем проверку избранного предыдущего трека.

  favoriteRequestId++;

  // Внешний трек не связан с таблицей tracks.

  liked.value = false;

  currentTrack.value = {
    id: track.id,

    title: track.title,

    artist:
        track.artist || 'Неизвестный исполнитель',

    archiveIdentifier: track.id,

    cover: 'cover-purple',

    symbol: '♫',
  };

  progress.value = 0;

  seekPosition.value = 0;

  audioDuration.value = 0;

  isSeeking.value = false;

  try {
    // Получаем прямую ссылку на аудиофайл.

    const audioFile = await getTrackAudio(track.id);

    // Пока загружался аудиофайл, пользователь
    // мог выбрать другой трек.

    if (currentTrack.value?.id !== track.id) {
      return;
    }

    await playAudio(audioFile.url);
  } catch (error) {
    console.error(
        'Ошибка воспроизведения трека Internet Archive:',
        error,
    );

    if (currentTrack.value?.id === track.id) {
      isPlaying.value = false;
    }
  }
}

// ============================================
// ВОСПРОИЗВЕДЕНИЕ ТРЕКОВ SKYFI
// ============================================

async function playTrack(
    track: ApiTrack,
): Promise<void> {
  const trackWithAudio = track as ApiTrack & {
    audio_url?: string | null;
  };

  const audioUrl = trackWithAudio.audio_url ?? undefined;

  currentTrack.value = {
    id: track.id,

    title: track.title,

    artist:
        track.artists
            .map((artist) => artist.name)
            .join(', ') || 'Неизвестный исполнитель',

    cover: 'cover-purple',

    symbol: '♫',

    tag: '',

    audioUrl,
  };

  // Проверяем избранное через API.

  void updateFavoriteState(track);

  progress.value = 0;

  seekPosition.value = 0;

  audioDuration.value = 0;

  isSeeking.value = false;

  if (!audioUrl) {
    audio.pause();

    isPlaying.value = false;

    console.warn(
        'У этого трека нет URL аудиофайла',
    );

    return;
  }

  await playAudio(audioUrl);
}

// ============================================
// PLAY / PAUSE
// ============================================

async function togglePlay(): Promise<void> {
  // Если трек ещё не выбран, запускаем первый.

  if (!currentTrack.value) {
    if (
        search.value.trim() &&
        externalTracks.value.length > 0
    ) {
      await playExternalTrack(
          externalTracks.value[0],
      );
    } else if (tracks.value.length > 0) {
      await playTrack(tracks.value[0]);
    }

    return;
  }

  if (audio.paused) {
    try {
      await audio.play();
    } catch (error) {
      console.error(
          'Ошибка продолжения воспроизведения:',
          error,
      );
    }
  } else {
    audio.pause();
  }
}

// ============================================
// ПЕРЕМОТКА ТРЕКА
// ============================================

/**
 * Обновляет позицию ползунка при его перемещении.
 *
 * Эту функцию можно использовать с @input.
 */

function onSeekInput(event: Event): void {
  const target = event.target;

  if (!(target instanceof HTMLInputElement)) {
    return;
  }

  isSeeking.value = true;

  const value = Number(target.value);

  seekPosition.value = Math.max(
      0,
      Math.min(
          value,
          audioDuration.value || 0,
      ),
  );

  progress.value = seekPosition.value;
}

/**
 * Устанавливает новую позицию воспроизведения.
 *
 * Не меняет audio.src, поэтому не перезапускает песню.
 */

function seekAudio(): void {
  if (
      !Number.isFinite(audio.duration) ||
      audio.duration <= 0
  ) {
    isSeeking.value = false;

    return;
  }

  const targetTime = Math.max(
      0,
      Math.min(
          progress.value,
          audio.duration,
      ),
  );

  audio.currentTime = targetTime;

  progress.value = targetTime;

  seekPosition.value = targetTime;

  isSeeking.value = false;
}

// ============================================
// ПРЕДЫДУЩИЙ / СЛЕДУЮЩИЙ ТРЕК
// ============================================

async function nextTrack(
    direction: number,
): Promise<void> {
  // Выбираем список в соответствии с режимом поиска.

  const playlist: (ApiTrack | ExternalTrack)[] =
      search.value.trim()
          ? externalTracks.value
          : tracks.value;

  if (playlist.length === 0) {
    return;
  }

  // Находим текущий трек.

  const currentIndex = playlist.findIndex(
      (track) =>
          String(track.id) ===
          String(currentTrack.value?.id),
  );

  let nextIndex: number;

  if (currentIndex === -1) {
    nextIndex =
        direction > 0
            ? 0
            : playlist.length - 1;
  } else {
    // Переключение по кругу.

    nextIndex =
        (
            currentIndex +
            direction +
            playlist.length
        ) % playlist.length;
  }

  const next = playlist[nextIndex];

  if (!next) {
    return;
  }

  // Внешние треки имеют строковый ID.

  if ('source' in next) {
    await playExternalTrack(next);
  } else {
    await playTrack(next);
  }
}

// ============================================
// ФОРМАТИРОВАНИЕ ВРЕМЕНИ
// ============================================

function formatTime(value: number): string {
  if (
      !Number.isFinite(value) ||
      value < 0
  ) {
    return '0:00';
  }

  const seconds = Math.floor(value);

  const minutes = Math.floor(seconds / 60);

  const remainingSeconds = seconds % 60;

  return `${minutes}:${String(
      remainingSeconds,
  ).padStart(2, '0')}`;
}

// ============================================
// ИНИЦИАЛИЗАЦИЯ
// ============================================

onMounted(() => {
  void loadTracks();

  document.addEventListener(
      'click',
      handleDocumentClick,
  );

  document.addEventListener(
      'keydown',
      handleEscape,
  );
});

// ============================================
// ОЧИСТКА ПРИ УХОДЕ СО СТРАНИЦЫ
// ============================================

onBeforeUnmount(() => {
  // Останавливаем поиск.

  if (searchTimeout) {
    clearTimeout(searchTimeout);
  }

  searchRequestId++;

  favoriteRequestId++;

  // Удаляем обработчики документа.

  document.removeEventListener(
      'click',
      handleDocumentClick,
  );

  document.removeEventListener(
      'keydown',
      handleEscape,
  );

  // Удаляем обработчики аудио.

  audio.removeEventListener(
      'timeupdate',
      handleTimeUpdate,
  );

  audio.removeEventListener(
      'loadedmetadata',
      handleLoadedMetadata,
  );

  audio.removeEventListener(
      'durationchange',
      handleDurationChange,
  );

  audio.removeEventListener(
      'play',
      handlePlay,
  );

  audio.removeEventListener(
      'pause',
      handlePause,
  );

  audio.removeEventListener(
      'ended',
      handleEnded,
  );

  // Останавливаем аудио и освобождаем ресурсы.

  audio.pause();

  audio.removeAttribute('src');

  audio.load();
});
</script>
<style>
:root {
  --skyfi-bg: #0b0c12;
  --skyfi-panel: #11131d;
  --skyfi-muted: #85899b;
  --skyfi-text: #f4f4fa;
  --skyfi-accent: #a78bfa;
}

* {
  box-sizing: border-box;
}

.skyfi-content {
  --background: var(--skyfi-bg);
  color: var(--skyfi-text);
}

.app-layout {
  min-height: 100%;
  padding-bottom: 112px;
  background:
      radial-gradient(
          ellipse at 70% 0%,
          rgba(105, 72, 190, 0.11),
          transparent 40%
      ),
      var(--skyfi-bg);
}

/* =========================
   БОКОВОЕ МЕНЮ
========================= */

.sidebar {
  position: fixed;
  inset: 0 auto 100px 0;
  width: 228px;
  padding: 30px 18px;
  background: rgba(15, 16, 24, 0.96);
  border-right: 1px solid rgba(255, 255, 255, 0.06);
  z-index: 5;
  display: flex;
  flex-direction: column;
}

.brand,
.mobile-brand {
  display: flex;
  align-items: center;
  gap: 11px;
  font-size: 25px;
  font-weight: 800;
  letter-spacing: -1px;
  color: white;
}

.brand-icon {
  width: 36px;
  height: 36px;
  display: grid;
  place-items: center;
  border-radius: 12px;
  color: white;
  background: linear-gradient(135deg, #a78bfa, #6545d5);
  box-shadow: 0 5px 22px #7c5ce744;
  font-weight: 900;
}

.brand-light {
  color: #b6a2ff;
}

.nav-label,
.eyebrow {
  color: #9295a8;
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 1.7px;
}

.nav-label {
  margin: 48px 10px 14px;
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 13px;
  width: 100%;
  padding: 13px 12px;
  margin: 3px 0;
  border: 0;
  border-radius: 10px;
  background: transparent;
  color: #9295a8;
  text-align: left;
  font: inherit;
  cursor: pointer;
  transition: 0.2s;
}

.nav-item:hover,
.nav-item.active {
  background: #a78bfa16;
  color: #c6b5ff;
}

.nav-item.active {
  box-shadow: inset 3px 0 #a78bfa;
}

.nav-icon {
  width: 22px;
  font-size: 21px;
  text-align: center;
}

.sidebar-bottom {
  margin-top: auto;
}

.sidebar-note {
  padding: 16px;
  border: 1px solid #ffffff0e;
  border-radius: 12px;
  color: #c6b5ff;
  font-size: 13px;
  line-height: 1.7;
}

.version {
  margin: 20px 8px 0;
  color: #646779;
  font-size: 9px;
  letter-spacing: 1.5px;
}

/* =========================
   ВЕРХНЯЯ ПАНЕЛЬ
========================= */

.main-area {
  margin-left: 228px;
}

.topbar {
  height: 86px;
  display: flex;
  align-items: center;
  gap: 18px;
  padding: 0 4.5%;
  border-bottom: 1px solid #ffffff0a;
}

.search {
  display: flex;
  align-items: center;
  gap: 12px;
  width: min(420px, 65%);
  padding: 11px 14px;
  border: 1px solid #ffffff0e;
  border-radius: 11px;
  background: #ffffff05;
  color: #888ca0;
}

.search > span {
  font-size: 22px;
}

.search input {
  width: 100%;
  color: white;
  border: 0;
  outline: 0;
  background: transparent;
  font: inherit;
  font-size: 12px;
}

.search kbd {
  white-space: nowrap;
  color: #696d7f;
  font-size: 10px;
}

/* =========================
   ОСНОВНОЙ КОНТЕНТ
========================= */

.page-content {
  max-width: 1500px;
  padding: 36px 4.5% 42px;
  margin: 0 auto;
}

/* =========================
   ПРИВЕТСТВЕННЫЙ БЛОК
========================= */

.welcome {
  min-height: 310px;
  padding: 38px 42px;
  display: flex;
  position: relative;
  overflow: hidden;
  align-items: center;
  border: 1px solid #ffffff0d;
  border-radius: 22px;
  background: linear-gradient(
      110deg,
      #191526 0%,
      #171322 53%,
      #211a39 100%
  );
}

.welcome-copy {
  position: relative;
  z-index: 2;
}

.welcome .eyebrow {
  display: flex;
  align-items: center;
  gap: 8px;
}

.welcome .eyebrow span {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #a78bfa;
  box-shadow: 0 0 12px #a78bfa;
}

.welcome h1 {
  margin: 22px 0 12px;
  font-size: clamp(30px, 3.2vw, 47px);
  line-height: 1.13;
  letter-spacing: -1.8px;
  color: #fff;
  font-weight: 800;
}

.welcome h1 span {
  color: #b7a3ff;
}

.welcome p {
  color: #a4a0b5;
  font-size: 13px;
  margin: 0 0 23px;
}

.primary-button {
  padding: 12px 17px;
  border: 0;
  border-radius: 10px;
  background: #a78bfa;
  color: #151020;
  font-size: 12px;
  font-weight: 800;
  cursor: pointer;
  transition:
      background 0.2s,
      transform 0.2s;
}

.primary-button:hover {
  background: #b9a5ff;
  transform: translateY(-1px);
}

.primary-button span {
  margin-right: 7px;
}

/* =========================
   ДЕКОРАТИВНАЯ ГРАФИКА
========================= */

.hero-art {
  position: absolute;
  width: 44%;
  height: 100%;
  right: 0;
  top: 0;
  overflow: hidden;
}

.hero-orb {
  position: absolute;
  width: 220px;
  height: 220px;
  border-radius: 50%;
  filter: blur(1px);
}

.orb-one {
  right: 15%;
  top: 12%;
  background: radial-gradient(
      circle at 30% 25%,
      #d4baff,
      #8b5cf6 35%,
      #302050 70%
  );
  opacity: 0.7;
}

.orb-two {
  width: 160px;
  height: 160px;
  right: 45%;
  top: 48%;
  background: radial-gradient(
      circle at 30% 25%,
      #9ce8e5,
      #3d83a0 45%,
      #232041 75%
  );
  opacity: 0.6;
}

.hero-disc {
  position: absolute;
  width: 170px;
  height: 170px;
  right: 24%;
  top: 22%;
  display: grid;
  place-items: center;
  border: 1px solid #ffffff35;
  border-radius: 50%;
  background: repeating-radial-gradient(
      circle,
      #171421 0 4px,
      #29213d 5px 7px
  );
  box-shadow: 0 15px 50px #0007;
}

.hero-disc div {
  width: 48px;
  height: 48px;
  border: 8px solid #b9a3ff;
  border-radius: 50%;
  background: #15111e;
}

.hero-caption {
  position: absolute;
  bottom: 24px;
  right: 22px;
  font-size: 9px;
  letter-spacing: 3px;
  color: #b5a5d5;
}

/* =========================
   СЕКЦИИ
========================= */

.section {
  margin-top: 39px;
}

.section-heading {
  display: flex;
  align-items: end;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 19px;
}

.section-heading h2 {
  margin: 9px 0 0;
  font-size: clamp(18px, 2vw, 23px);
  letter-spacing: -0.6px;
  color: #f3f2f9;
  font-weight: 750;
}

.text-button {
  padding: 8px 0;
  border: 0;
  background: transparent;
  color: #b5a1ff;
  font: inherit;
  font-size: 11px;
  cursor: pointer;
}

.text-button:hover {
  color: #d1c4ff;
}

/* =========================
   КАРТОЧКИ ТРЕКОВ
========================= */

.track-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 18px;
}

.track-card {
  min-width: 0;
  padding: 0;
  border: 0;
  background: transparent;
  text-align: left;
  cursor: pointer;
  color: inherit;
}

.cover {
  aspect-ratio: 1;
  position: relative;
  display: grid;
  place-items: center;
  overflow: hidden;
  border-radius: 13px;
  margin-bottom: 12px;
  transition: transform 0.2s;
}

.track-card:hover .cover {
  transform: translateY(-4px);
}

.cover-purple {
  background: radial-gradient(
      circle at 60% 35%,
      #d4a9fa,
      #6949a7 35%,
      #25203e 76%
  );
}

.cover-symbol {
  color: #ffffffc9;
  font-size: clamp(48px, 6vw, 78px);
  text-shadow: 0 5px 25px #0005;
}

.cover-play {
  position: absolute;
  right: 11px;
  bottom: 11px;
  width: 35px;
  height: 35px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: #b7a0ff;
  color: #211536;
  opacity: 0;
  transform: translateY(5px);
  transition: 0.2s;
}

.track-card:hover .cover-play {
  opacity: 1;
  transform: translateY(0);
}

.track-title,
.track-artist {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.track-title {
  color: #f0eff7;
  font-size: 12px;
  font-weight: 700;
}

.track-artist {
  margin-top: 5px;
  color: #85899c;
  font-size: 11px;
}

/* =========================
   ПУСТОЕ СОСТОЯНИЕ
========================= */

.empty-state {
  padding: 30px;
  border: 1px dashed #ffffff20;
  border-radius: 12px;
  color: #969aab;
  text-align: center;
}

/* =========================
   БЫСТРЫЙ ДОСТУП
========================= */

.quick-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}

.quick-card {
  display: flex;
  align-items: center;
  gap: 13px;
  min-width: 0;
  padding: 15px;
  border: 1px solid #ffffff0d;
  border-radius: 12px;
  background: #ffffff04;
  color: #f5f3fa;
  text-align: left;
  cursor: pointer;
  transition:
      background 0.2s,
      border-color 0.2s;
}

.quick-card:hover {
  background: #ffffff09;
  border-color: #a78bfa35;
}

.quick-icon {
  width: 43px;
  height: 43px;
  display: grid;
  place-items: center;
  flex-shrink: 0;
  border-radius: 10px;
  font-size: 22px;
}

.quick-icon.purple {
  background: #9d7bf72a;
  color: #c0aaff;
}

.quick-icon.green {
  background: #55cba323;
  color: #83e2b8;
}

.quick-card strong,
.quick-card small {
  display: block;
}

.quick-card strong {
  font-size: 12px;
}

.quick-card small {
  margin-top: 5px;
  color: #85899c;
  font-size: 10px;
}

.quick-arrow {
  margin-left: auto;
  color: #8e84aa;
}

/* =========================
   НИЖНИЙ АУДИОПЛЕЕР
========================= */

.player {
  position: fixed;
  inset: auto 0 0;
  z-index: 20;
  min-height: 91px;
  display: grid;
  grid-template-columns: 1fr 1.1fr 1fr;
  align-items: center;
  gap: 20px;
  padding: 13px 27px;
  border-top: 1px solid #ffffff12;
  background: rgba(17, 18, 27, 0.97);
  backdrop-filter: blur(20px);
}

/* Информация о текущем треке */

.now-playing {
  display: flex;
  align-items: center;
  gap: 11px;
  min-width: 0;
}

.mini-cover {
  width: 49px;
  height: 49px;
  display: grid;
  place-items: center;
  flex-shrink: 0;
  border-radius: 8px;
  color: white;
  font-size: 22px;
}

.mini-empty {
  background: #272238;
}

.now-info {
  min-width: 0;
}

.now-info strong,
.now-info span {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.now-info strong {
  color: #f5f3fa;
  font-size: 11px;
}

.now-info span {
  margin-top: 6px;
  color: #85899c;
  font-size: 10px;
}

/* Кнопки */

.heart-button,
.player-controls button {
  border: 0;
  background: transparent;
  color: #9295a8;
  cursor: pointer;
}

.heart-button {
  font-size: 22px;
}

.heart-button:hover {
  color: #d5c5ff;
}

.heart-button.liked {
  color: #e88bae;
}

/* Центральная область */

.player-center {
  min-width: 0;
}

.player-controls {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 21px;
  margin-bottom: 9px;
}

.player-controls button {
  font-size: 13px;
  transition: color 0.2s;
}

.player-controls button:hover {
  color: #d0c2ff;
}

.player-controls .play-button {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: #b8a2ff;
  color: #1b1428;
  font-size: 13px;
}

.player-controls .play-button:hover {
  background: #c9baff;
  color: #1b1428;
}

/* =========================
   ПРОГРЕСС ВОСПРОИЗВЕДЕНИЯ
========================= */

.progress-row {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
}

.progress-row > span {
  flex-shrink: 0;
  min-width: 35px;
  font-size: 11px;
  color: #9292a8;
  font-variant-numeric: tabular-nums;
}

.progress-row > span:last-child {
  text-align: right;
}

/*
 * Заливка определяется переменной --range-progress.
 * Значение задаётся через :style в шаблоне Vue.
 */

.progress,
.player-right input {
  --range-progress: 0%;

  appearance: none;
  -webkit-appearance: none;

  display: block;
  min-width: 0;
  width: 100%;
  height: 5px;

  margin: 0;
  padding: 0;

  border: none;
  border-radius: 999px;
  outline: none;

  background: linear-gradient(
      to right,
      #b39bff 0%,
      #b39bff var(--range-progress),
      #383744 var(--range-progress),
      #383744 100%
  );

  cursor: pointer;
}

/* Кружок ползунка: Chrome, Safari, Edge */

.progress::-webkit-slider-thumb,
.player-right input::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;

  width: 12px;
  height: 12px;

  border: none;
  border-radius: 50%;

  background: #c4b2ff;
  box-shadow: 0 0 5px #0005;

  cursor: grab;
}

.progress:active::-webkit-slider-thumb,
.player-right input:active::-webkit-slider-thumb {
  cursor: grabbing;
  transform: scale(1.15);
}

/* Кружок ползунка: Firefox */

.progress::-moz-range-thumb,
.player-right input::-moz-range-thumb {
  width: 12px;
  height: 12px;

  border: none;
  border-radius: 50%;

  background: #c4b2ff;
  box-shadow: 0 0 5px #0005;

  cursor: grab;
}

.progress:active::-moz-range-thumb,
.player-right input:active::-moz-range-thumb {
  cursor: grabbing;
}

/* Дорожка Firefox */

.progress::-moz-range-track,
.player-right input::-moz-range-track {
  height: 5px;
  border: none;
  border-radius: 999px;
  background: transparent;
}

/* Фокус с клавиатуры */

.progress:focus-visible,
.player-right input:focus-visible {
  outline: 2px solid #a78bfa80;
  outline-offset: 5px;
}

/* =========================
   ГРОМКОСТЬ
========================= */

.player-right {
  display: flex;
  align-items: center;
  justify-content: end;
  gap: 12px;
  color: #9a9caf;
}

.player-right > span {
  flex-shrink: 0;
}

.player-right input {
  width: 110px;
  max-width: 100%;
  flex: 0 1 110px;
}

/* =========================
   ПРОФИЛЬ
========================= */

.profile-menu {
  position: relative;
  margin-left: auto;
  flex-shrink: 0;
}

.profile-button {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;

  width: 42px;
  height: 42px;

  margin-left: 0;
  padding: 0;

  border: 1px solid #c0adff55;
  border-radius: 50%;

  background: #a78bfa18;
  color: #d5c9ff;

  font-size: 15px;
  font-weight: 700;

  cursor: pointer;
  transition:
      background 0.2s,
      border-color 0.2s;
}

.profile-button:hover {
  background: #a78bfa30;
  border-color: #c0adffaa;
}

.profile-button:disabled {
  opacity: 0.6;
  cursor: wait;
}

.profile-chevron {
  font-size: 11px;
  opacity: 0.7;
}

.profile-dropdown {
  position: absolute;
  top: calc(100% + 12px);
  right: 0;

  width: 260px;
  max-width: calc(100vw - 24px);

  padding: 8px;

  border: 1px solid #ffffff12;
  border-radius: 14px;

  background: #171824;
  box-shadow: 0 15px 45px #0008;

  z-index: 100;
  animation: profile-dropdown-in 0.16s ease-out;
}

@keyframes profile-dropdown-in {
  from {
    opacity: 0;
    transform: translateY(-5px);
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.profile-info {
  padding: 12px;
  min-width: 0;
}

.profile-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;

  color: #f5f3fa;
  font-size: 13px;
  font-weight: 700;
}

.profile-email {
  margin-top: 5px;

  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;

  color: #85899c;
  font-size: 11px;
}

.dropdown-divider {
  height: 1px;
  margin: 5px 0;
  background: #ffffff10;
}

.dropdown-item {
  display: flex;
  align-items: center;
  gap: 11px;

  width: 100%;
  padding: 11px 12px;

  border: 0;
  border-radius: 8px;

  background: transparent;
  color: #d8d6e5;

  font: inherit;
  font-size: 12px;
  text-align: left;

  cursor: pointer;
  transition:
      background 0.2s,
      color 0.2s;
}

.dropdown-item > span {
  width: 18px;
  text-align: center;
  font-size: 16px;
}

.dropdown-item:hover {
  background: #ffffff0a;
  color: #c6b5ff;
}

.dropdown-item:disabled {
  opacity: 0.6;
  cursor: wait;
}

.logout-item {
  color: #f09aab;
}

.logout-item:hover {
  background: #f05b7715;
  color: #ffb0bf;
}

.logout-error {
  padding: 8px 12px;
  color: #ff9ba9;
  font-size: 11px;
  line-height: 1.5;
}

/* =========================
   МОБИЛЬНАЯ НАВИГАЦИЯ
========================= */

.mobile-brand,
.mobile-nav {
  display: none;
}

/* =========================
   ПЛАНШЕТЫ
========================= */

@media (max-width: 1050px) {
  .sidebar {
    width: 190px;
    padding-inline: 13px;
  }

  .main-area {
    margin-left: 190px;
  }

  .welcome {
    padding: 28px;
  }

  .track-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .hero-art {
    opacity: 0.65;
  }

  .player {
    grid-template-columns: 1fr 1fr;
  }

  .player-right {
    display: none;
  }
}

/* =========================
   МОБИЛЬНЫЕ УСТРОЙСТВА
========================= */

@media (max-width: 650px) {
  .sidebar {
    display: none;
  }

  .main-area {
    margin-left: 0;
  }

  .topbar {
    height: 66px;
    padding: 0 17px;
    gap: 13px;
  }

  .mobile-brand {
    display: flex;
    font-size: 19px;
    gap: 7px;
  }

  .mobile-brand .brand-icon {
    width: 29px;
    height: 29px;
    border-radius: 9px;
  }

  .search {
    width: auto;
    flex: 1;
    min-width: 0;
    padding: 10px;
  }

  .search kbd {
    display: none;
  }

  .page-content {
    padding: 20px 17px 35px;
  }

  .welcome {
    min-height: 300px;
    padding: 25px 21px;
    border-radius: 17px;
    align-items: start;
  }

  .welcome h1 {
    font-size: 32px;
    margin-top: 24px;
  }

  .welcome p {
    max-width: 230px;
    line-height: 1.6;
  }

  .hero-art {
    width: 55%;
    right: -10%;
    opacity: 0.36;
  }

  .hero-disc {
    width: 125px;
    height: 125px;
    right: 17%;
    top: 30%;
  }

  .hero-disc div {
    width: 35px;
    height: 35px;
    border-width: 6px;
  }

  .hero-caption {
    display: none;
  }

  .section {
    margin-top: 30px;
  }

  .section-heading h2 {
    font-size: 18px;
  }

  .track-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 20px 13px;
  }

  .cover {
    border-radius: 11px;
  }

  .cover-symbol {
    font-size: 57px;
  }

  .cover-play {
    opacity: 1;
    transform: none;
    width: 30px;
    height: 30px;
  }

  .quick-grid {
    grid-template-columns: 1fr;
  }

  .player {
    bottom: 61px;
    min-height: 73px;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 8px;
    padding: 10px 14px;
  }

  .mini-cover {
    width: 42px;
    height: 42px;
  }

  .heart-button {
    display: none;
  }

  .player-center {
    display: flex;
    align-items: center;
    justify-content: end;
  }

  .player-controls {
    margin: 0;
    gap: 12px;
  }

  .player-controls button:first-child {
    display: none;
  }

  .progress-row {
    display: none;
  }

  .mobile-nav {
    position: fixed;
    z-index: 21;
    inset: auto 0 0;
    height: 62px;
    display: flex;
    justify-content: space-around;
    align-items: center;
    background: #10111a;
    border-top: 1px solid #ffffff12;
    padding-bottom: env(safe-area-inset-bottom);
  }

  .mobile-nav button {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 3px;
    border: 0;
    background: transparent;
    color: #85899c;
    cursor: pointer;
  }

  .mobile-nav button span {
    font-size: 20px;
  }

  .mobile-nav button small {
    font-size: 9px;
  }

  .mobile-nav button.active {
    color: #bba8ff;
  }

  /* Профиль на мобильном */

  .profile-menu {
    margin-left: 0;
  }

  .profile-button {
    width: 35px;
    height: 35px;
    font-size: 13px;
  }

  .profile-chevron {
    display: none;
  }

  .profile-dropdown {
    top: calc(100% + 10px);
    right: 0;
    width: 260px;
  }
}
</style>