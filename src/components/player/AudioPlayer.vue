<template>
  <!-- На странице волны бар скрыт: там свой интерфейс.
       Компонент остаётся смонтированным — модалка карточки
       трека доступна, при переходе на другую страницу бар
       возвращается мгновенно, с текущим треком. -->
  <footer
      v-show="!isWaveRoute"
      class="player"
      :style="{ '--player-progress': `${player.progressPercent}%` }"
      @click="handlePlayerSurfaceClick"
      @pointerdown="onSwipePointerDown"
  >
    <!-- Информация о текущем треке: слайдер. При горизонтальном
         драге сбоку подъезжает соседний трек; не дотянул —
         текущий возвращается на место. -->
    <div
        ref="nowSliderRef"
        class="now-slider"
        :class="{ 'now-slider-dragging': isTrackDragging }"
    >
      <!-- Предыдущий трек: за левым краем, подъезжает при драге вправо -->
      <div
          class="now-slide-side now-slider-slide"
          :style="prevSlideStyle"
          aria-hidden="true"
      >
        <div class="mini-cover mini-cover-side">
          <img
              v-if="prevLine.cover"
              :src="prevLine.cover"
              alt=""
              class="mini-cover__img"
          >
          <template v-else>♫</template>
        </div>

        <div class="now-info">
          <strong>{{ prevLine.title }}</strong>
          <span>{{ prevLine.artist }}</span>
        </div>
      </div>

      <div
          class="now-playing now-slider-slide"
          :style="currentSlideStyle"
      >
        <div
            v-if="player.currentTrack"
            class="mini-cover"
            :class="player.currentTrack.cover"
        >
          <img
              v-if="player.currentTrack.coverPath"
              :src="player.currentTrack.coverPath"
              alt=""
              class="mini-cover__img"
          >

          <template v-else>
            {{ player.currentTrack.symbol }}
          </template>
        </div>

        <div v-else class="mini-cover mini-empty">
          ♫
        </div>

        <div class="now-info">
          <strong>
            {{ player.currentTrack?.title ?? 'Выбери свой трек' }}
          </strong>

          <span>
      {{
              player.currentTrack?.artist
              ?? 'SkyFi · музыкальное пространство'
            }}
    </span>
        </div>

      <!-- Кнопка очереди воспроизведения -->
      <button
          ref="queueToggleRef"
          type="button"
          class="queue-toggle"
          :class="{ 'queue-toggle-active': showQueue }"
          :aria-pressed="showQueue"
          aria-label="Открыть очередь воспроизведения"
          title="Очередь воспроизведения"
          @click="showQueue = !showQueue"
      >
        <svg
            viewBox="0 0 24 24"
            width="21"
            height="21"
            fill="none"
            stroke="currentColor"
            stroke-width="1.8"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
        >
          <path d="M4 6h16" />
          <path d="M4 12h16" />
          <path d="M4 18h10" />
          <path d="m17 16 3 2-3 2" />
        </svg>

        <span
            v-if="player.serverQueueCount > 0"
            class="queue-count"
        >
      {{ player.serverQueueCount }}
    </span>
      </button>

      <!-- Избранное -->
      <button
          ref="heartButtonRef"
          class="heart-button"
          :class="{ liked: player.liked }"
          :disabled="
      player.favoriteLoading ||
      !player.currentTrack
    "
          :aria-label="
      player.liked
        ? 'Убрать из избранного'
        : 'Добавить в избранное'
    "
          :aria-pressed="player.liked"
          type="button"
          @click="player.toggleFavorite()"
      >
        <svg
            viewBox="0 0 24 24"
            class="control-icon heart-icon"
            :class="{ 'is-liked': player.liked }"
            fill="currentColor"
            aria-hidden="true"
        >
          <path
              d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1.1L12 21l7.8-7.5 1.1-1.1a5.5 5.5 0 0 0-.1-7.8Z"
          />
        </svg>
      </button>
      <TrackContextMenu
          v-if="player.currentTrack"
          :track="player.currentTrack"
          :is-favorite="player.liked"
          :loading="player.isLoading || player.favoriteLoading"
          @action="handleTrackMenuAction"
      />
      </div>

      <!-- Следующий трек: за правым краем, подъезжает при драге влево -->
      <div
          class="now-slide-side now-slider-slide"
          :style="nextSlideStyle"
          aria-hidden="true"
      >
        <div class="mini-cover mini-cover-side">
          <img
              v-if="nextLine.cover"
              :src="nextLine.cover"
              alt=""
              class="mini-cover__img"
          >
          <template v-else>♫</template>
        </div>

        <div class="now-info">
          <strong>{{ nextLine.title }}</strong>
          <span>{{ nextLine.artist }}</span>
        </div>
      </div>
    </div>

    <!-- Центральное управление -->
    <div class="player-center">
      <div class="player-controls">
        <!-- Перемешивание -->
        <button
            type="button"
            class="mode-button shuffle-button"
            :class="{ 'mode-active': player.isShuffleEnabled }"
            :aria-pressed="player.isShuffleEnabled"
            :aria-label="
              player.isShuffleEnabled
                ? 'Выключить случайный порядок'
                : 'Включить случайный порядок'
            "
            :title="
              player.isShuffleEnabled
                ? 'Случайный порядок включён'
                : 'Случайный порядок выключен'
            "
            :disabled="player.isLoading"
            @click="player.toggleShuffle()"
        >
          <svg
              viewBox="0 0 24 24"
              width="21"
              height="21"
              fill="none"
              stroke="currentColor"
              stroke-width="1.8"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
          >
            <path d="M16 3h5v5" />
            <path d="M4 20L21 3" />
            <path d="M21 16v5h-5" />
            <path d="M15 15l6 6" />
            <path d="M4 4l5 5" />
          </svg>
          <span
              v-if="player.isShuffleEnabled"
              class="shuffle-indicator"
              aria-hidden="true"
          ></span>
        </button>

        <!-- Предыдущий трек -->
        <button
            type="button"
            aria-label="Предыдущий трек"
            :disabled="
            player.isLoading ||
            !player.currentTrack
          "
            @click="player.playPrevious()"
        >
          <svg viewBox="0 0 24 24" class="control-icon" aria-hidden="true">
            <path d="M6 5v14M19 5 8 12l11 7V5Z" />
          </svg>
        </button>

        <!-- Play / Pause -->
        <button
            ref="playButtonRef"
            class="play-button"
            type="button"
            :disabled="player.isLoading || !player.currentTrack"
            :aria-label="player.isPlaying ? 'Пауза' : 'Воспроизвести'"
            :title="player.isPlaying ? 'Пауза' : 'Воспроизвести'"
            @click.stop="player.togglePlay()"
        >
          <svg
              v-if="player.isPlaying"
              class="control-icon"
              viewBox="0 0 24 24"
              aria-hidden="true"
          >
            <rect x="6" y="4" width="4" height="16" rx="1" />
            <rect x="14" y="4" width="4" height="16" rx="1" />
          </svg>

          <svg
              v-else
              class="control-icon play-icon"
              viewBox="0 0 24 24"
              aria-hidden="true"
          >
            <path d="M7 4.5L20 12 7 19.5Z" />
          </svg>
        </button>



        <!-- Следующий трек -->
        <button
            type="button"
            aria-label="Следующий трек"
            :disabled="
        player.isLoading ||
        !player.currentTrack
    "
            @click="player.playNext()"
        >
          <svg viewBox="0 0 24 24" class="control-icon" aria-hidden="true">
            <path d="M18 5v14M5 5l11 7-11 7V5Z" />
          </svg>
        </button>
        <!-- Режим повтора: выключен / всё / один трек -->
        <button
            type="button"
            class="mode-button repeat-button"
            :class="{ 'mode-active': player.repeatMode !== 'off' }"
            :aria-pressed="player.repeatMode !== 'off'"
            :aria-label="
        player.repeatMode === 'off'
            ? 'Включить повтор'
            : player.repeatMode === 'all'
              ? 'Повтор всего плейлиста'
              : 'Повтор одного трека'
    "
            :title="
        player.repeatMode === 'off'
            ? 'Повтор выключен'
            : player.repeatMode === 'all'
              ? 'Повтор всего плейлиста'
              : 'Повтор одного трека'
    "
            :disabled="player.isLoading"
            @click="player.toggleRepeatMode()"
        >
          <svg
              v-if="player.repeatMode !== 'one'"
              viewBox="0 0 24 24"
              width="21"
              height="21"
              fill="none"
              stroke="currentColor"
              stroke-width="1.8"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
          >
            <path d="m17 2 4 4-4 4" />
            <path d="M3 11V9a3 3 0 0 1 3-3h15" />
            <path d="m7 22-4-4 4-4" />
            <path d="M21 13v2a3 3 0 0 1-3 3H3" />
          </svg>

          <svg
              v-else
              viewBox="0 0 24 24"
              width="21"
              height="21"
              fill="none"
              stroke="currentColor"
              stroke-width="1.8"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
          >
            <path d="m17 2 4 4-4 4" />
            <path d="M3 11V9a3 3 0 0 1 3-3h15" />
            <path d="m7 22-4-4 4-4" />
            <path d="M21 13v2a3 3 0 0 1-3 3H3" />
            <text
                x="12"
                y="14"
                text-anchor="middle"
                font-size="9"
                font-weight="700"
                fill="currentColor"
                stroke="none"
            >1</text>
          </svg>

          <span
              v-if="player.repeatMode !== 'off'"
              class="shuffle-indicator"
              aria-hidden="true"
          ></span>
        </button>
      </div>

      <!-- Прогресс воспроизведения -->
      <div class="progress-row">
        <span>
          {{ player.formatTime(player.progress) }}
        </span>

        <input
            :value="Math.min(
                player.audioDuration,
                Math.max(0, player.progress)
              )"
            class="progress"
            type="range"
            min="0"
            :max="Math.max(1, player.audioDuration)"
            step="0.1"
            :style="{
                '--range-progress': `${player.progressPercent}%`,
              }"
                        aria-label="Позиция воспроизведения"
                        :disabled="
                !player.currentTrack ||
                player.audioDuration <= 0 ||
                player.isLoading
              "
            @keydown="onProgressKeyDown"
            @blur="onProgressBlur"
            @pointerdown="player.isSeeking = true"
            @input="player.progress = Number(($event.target as HTMLInputElement).value)"
            @change="player.seekAudio(player.progress); player.isSeeking = false"
        />

        <span>
          {{ player.formatTime(player.audioDuration) }}
        </span>
      </div>
    </div>


    <!-- Громкость -->
    <div class="player-right">
      <div class="device-selector">
        <button
            ref="deviceButtonRef"
            type="button"
            class="device-button mode-button"
            :class="{ 'mode-active': showDeviceMenu }"
            :aria-pressed="showDeviceMenu"
            :disabled="
              player.isDevicesLoading ||
              player.deviceSwitchLoading
            "
            aria-label="Выбрать устройство воспроизведения"
            title="Устройство воспроизведения"
            @click="showDeviceMenu = !showDeviceMenu"
        >
          <svg
              viewBox="0 0 24 24"
              width="21"
              height="21"
              fill="none"
              stroke="currentColor"
              stroke-width="1.8"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
          >
            <rect x="3" y="5" width="13" height="11" rx="2" />
            <path d="M7 20h5" />
            <path d="M9.5 16v4" />
            <rect x="17" y="8" width="4" height="11" rx="1.2" />
            <path d="M18.5 16.5h1" />
          </svg>
        </button>

        <div
            v-if="showDeviceMenu"
            class="device-menu"
        >
          <strong>Устройство воспроизведения</strong>

          <p v-if="player.isDevicesLoading">
            Загрузка устройств…
          </p>

          <p
              v-else-if="player.devices.length === 0"
              class="device-empty"
          >
            Нет зарегистрированных устройств
          </p>

          <button
              v-for="device in player.devices"
              :key="device.id"
              type="button"
              class="device-option"
              :class="{
                'device-option-active':
                  device.id === player.activeDeviceId,
              }"
              :disabled="player.deviceSwitchLoading"
              @click="selectDevice(device.id)"
          >
            <span>
              {{ device.type === 'phone' ? '▯' : '▣' }}
            </span>

            <span class="device-option-name">
              {{ device.name }}
            </span>

            <span
                class="device-option-status"
                :class="{
                  'device-option-status-online': player.isDeviceOnline(device),
                }"
            >
              {{ player.isDeviceOnline(device) ? 'онлайн' : 'офлайн' }}
            </span>

            <span
                v-if="device.id === player.localDeviceId"
                class="device-option-current"
                title="Приложение запущено на этом устройстве"
            >
              это устройство
            </span>

            <span v-if="device.id === player.activeDeviceId">
              ✓
            </span>
          </button>
        </div>
      </div>

      <!-- Вертикальная громкость -->
      <div class="volume-control">
        <button
            type="button"
            class="volume-button"
            aria-label="Настроить громкость"
            aria-haspopup="true"
            title="Громкость"
        >
          <svg
              viewBox="0 0 24 24"
              width="21"
              height="21"
              fill="none"
              stroke="currentColor"
              stroke-width="1.8"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
          >
            <path d="M11 5 6 9H3v6h3l5 4V5Z" />
            <path
                v-if="player.volume > 0"
                d="M15.5 8.5a5 5 0 0 1 0 7"
            />
            <path
                v-if="player.volume > 0"
                d="M18.5 5.5a9 9 0 0 1 0 13"
            />
            <path
                v-if="player.volume === 0"
                d="m16 9 5 6m0-6-5 6"
            />
          </svg>
        </button>

        <div class="volume-slider-popover">
          <span class="volume-value">
            {{ player.volume }}%
          </span>

          <input
              v-model.number="player.volume"
              class="volume-slider"
              type="range"
              min="0"
              max="100"
              step="1"
              aria-label="Громкость"
              @keydown="onVolumeKeyDown"
              :style="{
                '--range-progress': `${player.volume}%`,
              }"
          />
        </div>
      </div>

    </div>
  </footer>
  <Teleport to="body">
    <div
        v-if="ui.trackDetailsOpen && player.currentTrack"
        class="track-details-backdrop"
        @click.self="onBackdropClick"
        @pointerdown="onSwipePointerDown"
    >
      <section
          class="track-details-modal"
          role="dialog"
          aria-modal="true"
          aria-label="Плеер и информация о треке"
      >
        <header class="track-details-header">
          <button
              ref="trackDetailsCloseRef"
              type="button"
              class="track-details-close"
              aria-label="Закрыть плеер"
              @click="ui.closeTrackDetails()"
          >
            <svg
                viewBox="0 0 24 24"
                width="20"
                height="20"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
            >
              <path d="m6 9 6 6 6-6" />
            </svg>
          </button>

          <span>СЕЙЧАС ИГРАЕТ</span>

          <div class="track-details-actions">
            <div class="track-details-device-selector">
              <button
                  type="button"
                  class="track-details-queue"
                  :disabled="
                    player.isDevicesLoading ||
                    player.deviceSwitchLoading
                  "
                  aria-label="Выбрать устройство воспроизведения"
                  title="Устройство воспроизведения"
                  @click="showCardDeviceMenu = !showCardDeviceMenu"
              >
                <svg
                    viewBox="0 0 24 24"
                    width="19"
                    height="19"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="1.8"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    aria-hidden="true"
                >
                  <rect x="3" y="5" width="13" height="11" rx="2" />
                  <path d="M7 20h5" />
                  <path d="M9.5 16v4" />
                  <rect x="17" y="8" width="4" height="11" rx="1.2" />
                  <path d="M18.5 16.5h1" />
                </svg>
              </button>

              <div
                  v-if="showCardDeviceMenu"
                  class="device-menu track-details-device-menu"
              >
                <strong>Устройство воспроизведения</strong>

                <p v-if="player.isDevicesLoading">
                  Загрузка устройств…
                </p>

                <p
                    v-else-if="player.devices.length === 0"
                    class="device-empty"
                >
                  Нет зарегистрированных устройств
                </p>

                <button
                    v-for="device in player.devices"
                    :key="device.id"
                    type="button"
                    class="device-option"
                    :class="{
                      'device-option-active':
                        device.id === player.activeDeviceId,
                    }"
                    :disabled="player.deviceSwitchLoading"
                    @click="selectDevice(device.id)"
                >
                  <span>
                    {{ device.type === 'phone' ? '▯' : '▣' }}
                  </span>

                  <span class="device-option-name">
                    {{ device.name }}
                  </span>

                  <span
                      class="device-option-status"
                      :class="{
                        'device-option-status-online':
                          player.isDeviceOnline(device),
                      }"
                  >
                    {{ player.isDeviceOnline(device) ? 'онлайн' : 'офлайн' }}
                  </span>

                  <span
                      v-if="device.id === player.localDeviceId"
                      class="device-option-current"
                      title="Приложение запущено на этом устройстве"
                  >
                    это устройство
                  </span>

                  <span v-if="device.id === player.activeDeviceId">
                    ✓
                  </span>
                </button>
              </div>
            </div>

            <button
                type="button"
                class="track-details-queue"
                aria-label="Открыть очередь"
                @click="showQueue = true; ui.closeTrackDetails()"
            >
              <svg
                  viewBox="0 0 24 24"
                  width="19"
                  height="19"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.8"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  aria-hidden="true"
              >
                <path d="M4 6h16" />
                <path d="M4 12h16" />
                <path d="M4 18h10" />
                <path d="m17 16 3 2-3 2" />
              </svg>

              <span
                  v-if="player.serverQueueCount > 0"
                  class="queue-count"
              >
                {{ player.serverQueueCount }}
              </span>
            </button>
          </div>
        </header>

        <div
            class="track-details-cover"
            :class="player.currentTrack.cover"
        >
          <img
              v-if="player.currentTrack.coverPath"
              :src="player.currentTrack.coverPath"
              alt=""
              class="track-details-cover__img"
          >

          <template v-else>
            {{ player.currentTrack.symbol || '♫' }}
          </template>
        </div>

        <div class="track-details-info">
          <div class="track-details-text">
            <div class="track-details-title-row">
              <h2
                  ref="titleMarqueeRef"
                  class="track-details-title marquee"
                  :class="{ 'marquee--active': titleOverflows }"
              >
                <span class="marquee-track">
                  <span class="marquee-chunk">
                    {{ player.currentTrack.title }}
                  </span><span
                      class="marquee-chunk"
                      aria-hidden="true"
                  >{{ player.currentTrack.title }}</span>
                </span>
              </h2>

              <DownloadStatusIcon
                  :track="player.currentTrack as unknown as Track"
              />

              <button
                  type="button"
                  class="track-details-share"
                  aria-label="Поделиться треком"
                  title="Поделиться треком"
                  @click="shareModalOpen = true"
              >
                <svg
                    viewBox="0 0 24 24"
                    width="18"
                    height="18"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="1.8"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    aria-hidden="true"
                >
                  <path d="M12 15V4" />
                  <path d="m7.5 8.5 4.5-4.5 4.5 4.5" />
                  <path d="M5 13v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5" />
                </svg>
              </button>

              <div class="track-details-menu-wrap">
                <button
                    type="button"
                    class="track-details-share"
                    :class="{ 'track-details-share-active': downloadMenuOpen }"
                    aria-label="Действия с треком"
                    title="Действия с треком"
                    @click="downloadMenuOpen = !downloadMenuOpen"
                >
                  <svg
                      viewBox="0 0 24 24"
                      width="18"
                      height="18"
                      fill="currentColor"
                      aria-hidden="true"
                  >
                    <circle cx="12" cy="5" r="1.7" />
                    <circle cx="12" cy="12" r="1.7" />
                    <circle cx="12" cy="19" r="1.7" />
                  </svg>
                </button>

                <div
                    v-if="downloadMenuOpen"
                    class="track-details-menu"
                >
                  <DownloadTrackItem
                      :track="player.currentTrack as unknown as Track"
                      @close="downloadMenuOpen = false"
                  />
                </div>
              </div>
            </div>

            <p>
              {{ player.currentTrack.artist || 'Неизвестный исполнитель' }}
            </p>

            <p
                v-if="player.currentTrack.albumTitle"
                class="track-details-album"
            >
              {{ player.currentTrack.albumTitle }}
            </p>
          </div>
        </div>

        <div class="track-details-progress">
          <!--
            Кастомный ползунок перемотки (pointer-driven):
            нативный input[type=range] с appearance:none на тонком треке
            в части браузеров перестаёт принимать pointer-события.
          -->
          <div
              class="seek-bar"
              :class="{
                'seek-bar--dragging': seekDragging,
                'seek-bar--disabled': seekDisabled,
              }"
              role="slider"
              aria-label="Перемотка трека"
              :aria-valuemin="0"
              :aria-valuemax="Math.round(seekDuration)"
              :aria-valuenow="Math.round(seekValue)"
              :tabindex="seekDisabled ? -1 : 0"
              @pointerdown="onSeekPointerDown"
              @pointermove="onSeekPointerMove"
              @pointerup="onSeekPointerUp"
              @pointercancel="onSeekPointerCancel"
              @keydown="onSeekKeyDown"
          >
            <div class="seek-bar__track">
              <div
                  class="seek-bar__fill"
                  :style="{ width: `${seekPercent}%` }"
              ></div>

              <div
                  class="seek-bar__thumb"
                  :style="{ left: `${seekPercent}%` }"
              ></div>
            </div>
          </div>

          <div class="track-details-times">
            <span>{{ player.formatTime(seekValue) }}</span>
            <span>{{ player.formatTime(player.audioDuration) }}</span>
          </div>
        </div>

        <div class="track-details-controls">
          <div class="track-details-controls-main">
            <button
                type="button"
                aria-label="Предыдущий трек"
                :disabled="player.isLoading || !player.currentTrack"
                @click="player.playPrevious()"
            >
              <svg viewBox="0 0 24 24" class="control-icon" aria-hidden="true">
                <path d="M6 5v14M19 5 8 12l11 7V5Z" />
              </svg>
            </button>

            <button
                ref="trackDetailsPlayRef"
                type="button"
                class="track-details-play"
                :disabled="player.isLoading || !player.currentTrack"
                :aria-label="player.isPlaying ? 'Пауза' : 'Воспроизвести'"
                @click="player.togglePlay()"
            >
              <svg
                  v-if="player.isPlaying"
                  class="control-icon"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
              >
                <rect x="6" y="4" width="4" height="16" rx="1" />
                <rect x="14" y="4" width="4" height="16" rx="1" />
              </svg>

              <svg
                  v-else
                  class="control-icon"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
              >
                <path d="M7 4.5L20 12 7 19.5Z" />
              </svg>
            </button>

            <button
                type="button"
                aria-label="Следующий трек"
                :disabled="player.isLoading || !player.currentTrack"
                @click="player.playNext()"
            >
              <svg viewBox="0 0 24 24" class="control-icon" aria-hidden="true">
                <path d="M18 5v14M5 5l11 7-11 7V5Z" />
              </svg>
            </button>
          </div>

          <button
              type="button"
              class="track-details-like"
              :class="{ liked: player.liked }"
              :disabled="
                player.favoriteLoading || !player.currentTrack
              "
              :aria-pressed="player.liked"
              :aria-label="
                player.liked
                  ? 'Убрать из избранного'
                  : 'Добавить в избранное'
              "
              @click="player.toggleFavorite()"
          >
            <svg
                viewBox="0 0 24 24"
                class="control-icon track-details-like-icon"
                aria-hidden="true"
            >
              <defs>
                <linearGradient
                    id="track-details-like-gradient"
                    x1="0"
                    y1="0"
                    x2="1"
                    y2="1"
                >
                  <stop offset="0" stop-color="#ff8fa3" />
                  <stop offset="1" stop-color="#ef2d56" />
                </linearGradient>
              </defs>

              <path
                  d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1.1L12 21l7.8-7.5 1.1-1.1a5.5 5.5 0 0 0-.1-7.8Z"
              />
            </svg>
          </button>
        </div>

        <div class="track-details-modes">
          <button
              type="button"
              class="track-details-mode"
              :class="{ 'mode-active': player.isShuffleEnabled }"
              :aria-pressed="player.isShuffleEnabled"
              :disabled="player.isLoading"
              aria-label="Случайный порядок"
              @click="player.toggleShuffle()"
          >
            <svg
                viewBox="0 0 24 24"
                width="19"
                height="19"
                fill="none"
                stroke="currentColor"
                stroke-width="1.8"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
            >
              <path d="M16 3h5v5" />
              <path d="M4 20L21 3" />
              <path d="M21 16v5h-5" />
              <path d="M15 15l6 6" />
              <path d="M4 4l5 5" />
            </svg>

            <span
                v-if="player.isShuffleEnabled"
                class="shuffle-indicator"
                aria-hidden="true"
            ></span>
          </button>

          <button
              type="button"
              class="track-details-mode"
              :class="{ 'mode-active': player.repeatMode !== 'off' }"
              :aria-pressed="player.repeatMode !== 'off'"
              :disabled="player.isLoading"
              :aria-label="
                player.repeatMode === 'one'
                    ? 'Повтор одного трека'
                    : 'Повтор'
              "
              @click="player.toggleRepeatMode()"
          >
            <svg
                viewBox="0 0 24 24"
                width="19"
                height="19"
                fill="none"
                stroke="currentColor"
                stroke-width="1.8"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
            >
              <path d="m17 2 4 4-4 4" />
              <path d="M3 11V9a3 3 0 0 1 3-3h15" />
              <path d="m7 22-4-4 4-4" />
              <path d="M21 13v2a3 3 0 0 1-3 3H3" />
              <text
                  v-if="player.repeatMode === 'one'"
                  x="12"
                  y="14"
                  text-anchor="middle"
                  font-size="9"
                  font-weight="700"
                  fill="currentColor"
                  stroke="none"
              >1</text>
            </svg>

            <span
                v-if="player.repeatMode !== 'off'"
                class="shuffle-indicator"
                aria-hidden="true"
            ></span>
          </button>
        </div>

        <ShareTrackModal
            v-if="shareModalOpen"
            :track="player.currentTrack as unknown as Track"
            @close="shareModalOpen = false"
        />
      </section>
    </div>
  </Teleport>
  <QueuePanel
      :open="showQueue"
      :current-track="player.currentTrack"
      @close="showQueue = false"
  />
</template>

<script setup lang="ts">
import './audioPlayer.css';

import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import usePlayerStore from '@/stores/player';
import { useUiStore } from '@/stores/ui';
import QueuePanel from '@/components/player/queue/QueuePanel.vue';
import TrackContextMenu from '@/components/track-menu/TrackContextMenu.vue';
import ShareTrackModal from '@/components/track-menu/ShareTrackModal.vue';
import DownloadTrackItem from '@/components/track-menu/DownloadTrackItem.vue';
import DownloadStatusIcon from '@/components/track-menu/DownloadStatusIcon.vue';
import { registerHardwareBackHandler } from '@/lib/hardwareBack';
import type { Track } from '@/types/TrackType';

const player = usePlayerStore();
const ui = useUiStore();
const route = useRoute();

// Бар скрывается на странице волны (см. template), модалка — нет.
const isWaveRoute = computed(() => route.path === '/wave');

const showQueue = ref(false);
const showDeviceMenu = ref(false);
// Меню устройств в карточке трека живёт отдельно от бара:
// бэкдроп закрывает бар, дропдаун внутри карточки должен быть виден.
const showCardDeviceMenu = ref(false);
const shareModalOpen = ref(false);
const downloadMenuOpen = ref(false);

// Бегущая строка названия: замеряем, влезает ли текст целиком.
const titleMarqueeRef = ref<HTMLElement | null>(null);
const titleOverflows = ref(false);

async function measureTitleOverflow(): Promise<void> {
    await nextTick();

    const el = titleMarqueeRef.value;

    titleOverflows.value =
        el !== null && el.scrollWidth > el.clientWidth + 4;
}

watch(
    () => player.currentTrack?.id,
    () => {
        titleOverflows.value = false;
        void measureTitleOverflow();
    },
);

watch(
    () => ui.trackDetailsOpen,
    (open) => {
        if (open) void measureTitleOverflow();
    },
);

// Цели для перехода фокуса с прогресс-бара пультом (Android TV).
const playButtonRef = ref<HTMLButtonElement | null>(null);
const queueToggleRef = ref<HTMLButtonElement | null>(null);
const heartButtonRef = ref<HTMLButtonElement | null>(null);
const deviceButtonRef = ref<HTMLButtonElement | null>(null);
const trackDetailsCloseRef = ref<HTMLButtonElement | null>(null);
const trackDetailsPlayRef = ref<HTMLButtonElement | null>(null);

// Счётчик повторов keydown при удержании клавиши пульта.
let seekKeyRepeat = 0;

// Короткое нажатие — ±10 с, удержание — прыжки по минуте.
function seekStep(): number {
  return seekKeyRepeat >= 6 ? 60 : 10;
}

function clampSeekTarget(value: number): number {
  return Math.min(Math.max(0, value), Math.max(1, player.audioDuration));
}

// ============================================
// ПЕРЕМОТКА В ПОЛНОЭКРАННОМ ПЛЕЕРЕ
// ============================================

const seekDragging = ref(false);
const seekDragValue = ref(0);

const seekDuration = computed(() => Math.max(1, player.audioDuration));

const seekValue = computed(() =>
    seekDragging.value
        ? seekDragValue.value
        : Math.min(seekDuration.value, Math.max(0, player.progress)),
);

const seekPercent = computed(
    () => (seekValue.value / seekDuration.value) * 100,
);

const seekDisabled = computed(
    () =>
        !player.currentTrack ||
        player.audioDuration <= 0 ||
        player.isLoading,
);

function updateSeekFromPointer(event: PointerEvent): void {
    const target = event.currentTarget;

    if (!(target instanceof HTMLElement)) {
        return;
    }

    const rect = target.getBoundingClientRect();

    if (rect.width <= 0) {
        return;
    }

    const ratio = Math.min(
        1,
        Math.max(0, (event.clientX - rect.left) / rect.width),
    );

    seekDragValue.value = ratio * seekDuration.value;
}

function onSeekPointerDown(event: PointerEvent): void {
    if (seekDisabled.value) {
        return;
    }

    if (event.currentTarget instanceof HTMLElement) {
        event.currentTarget.setPointerCapture(event.pointerId);
    }

    seekDragging.value = true;
    player.isSeeking = true;
    updateSeekFromPointer(event);
}

function onSeekPointerMove(event: PointerEvent): void {
    if (!seekDragging.value) {
        return;
    }

    updateSeekFromPointer(event);
}

function onSeekPointerUp(event: PointerEvent): void {
    if (!seekDragging.value) {
        return;
    }

    updateSeekFromPointer(event);
    finishSeek();
}

function onSeekPointerCancel(): void {
    if (!seekDragging.value) {
        return;
    }

    // Отмена перетаскивания — возвращаем отображение к реальному прогрессу.
    seekDragging.value = false;
    player.isSeeking = false;
}

function finishSeek(): void {
    const target = seekDragValue.value;

    seekDragging.value = false;

    void player.seekAudio(target);
    player.isSeeking = false;
}

function onSeekKeyDown(event: KeyboardEvent): void {
    if (seekDisabled.value) {
        return;
    }

    if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
        event.preventDefault();
        seekKeyRepeat = event.repeat ? seekKeyRepeat + 1 : 0;

        const delta = event.key === 'ArrowRight' ? seekStep() : -seekStep();

        void player.seekAudio(clampSeekTarget(seekValue.value + delta));
        return;
    }

    if (event.key === 'ArrowDown') {
        event.preventDefault();
        seekKeyRepeat = 0;
        trackDetailsPlayRef.value?.focus();
        return;
    }

    if (event.key === 'ArrowUp') {
        event.preventDefault();
        seekKeyRepeat = 0;
        trackDetailsCloseRef.value?.focus();
    }
}

/*
 * Прогресс-бар нижнего плеера и пульт Android TV: нативный
 * input[type=range] съедает стрелки сам (шаг 0.1 с) и не отпускает
 * фокус. Перехватываем клавиши: влево/вправо — перемотка,
 * вверх/вниз — переход фокуса на соседние кнопки.
 */
function onProgressKeyDown(event: KeyboardEvent): void {
    const input = event.currentTarget;

    if (!(input instanceof HTMLInputElement) || input.disabled) {
        return;
    }

    if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
        event.preventDefault();

        const direction = event.key === 'ArrowRight' ? 1 : -1;
        const duration = Math.max(0, player.audioDuration);

        // На краю трека стрелка уводит фокус с ползунка дальше по экрану.
        if (direction < 0 && player.progress < 1) {
            seekKeyRepeat = 0;
            heartButtonRef.value?.focus();
            return;
        }

        if (direction > 0 && duration > 0 && player.progress >= duration - 0.5) {
            seekKeyRepeat = 0;
            deviceButtonRef.value?.focus();
            return;
        }

        seekKeyRepeat = event.repeat ? seekKeyRepeat + 1 : 0;

        const delta = direction * seekStep();

        void player.seekAudio(clampSeekTarget(player.progress + delta));
        return;
    }

    if (event.key === 'ArrowUp') {
        event.preventDefault();
        seekKeyRepeat = 0;
        playButtonRef.value?.focus();
        return;
    }

    if (event.key === 'ArrowDown') {
        event.preventDefault();
        seekKeyRepeat = 0;
        queueToggleRef.value?.focus();
    }
}

function onProgressBlur(): void {
    seekKeyRepeat = 0;
}

// Вертикальный слайдер громкости не отпускает фокус по горизонтали.
function onVolumeKeyDown(event: KeyboardEvent): void {
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault();

        const control = (event.currentTarget as HTMLElement | null)
            ?.closest('.volume-control');
        const button = control?.querySelector<HTMLButtonElement>('.volume-button');

        button?.focus();
    }
}

// ============================================
// СЛАЙДЕР ТРЕКОВ: драг влево — следующий, вправо — предыдущий.
// При драге соседний трек подъезжает сбоку; не дотянул —
// текущий возвращается на место.
// ============================================

const nowSliderRef = ref<HTMLElement | null>(null);

const swipeStart = ref<{
    x: number;
    y: number;
    pointerId: number;
} | null>(null);

/** Текущее смещение текущего трека в px (драг и вылет при свайпе). */
const dragOffset = ref(0);

/** Идёт драг: трансформации без анимации, следуют за пальцем. */
const isTrackDragging = ref(false);

/** Трек вылетает по завершённому свайпу ('next' | 'prev'). */
const slideCommit = ref<null | 'next' | 'prev'>(null);

let swipeFired = false;

const SWIPE_MIN_DISTANCE = 60;

/** Соседние треки для подъезжающих карточек. */
function sideLine(track: Track | null, fallbackTitle: string): {
    title: string;
    artist: string;
    cover: string | null;
} {
    if (!track) {
        return { title: fallbackTitle, artist: '—', cover: null };
    }

    return {
        title: track.title,
        artist:
            track.meta?.artists?.map(artist => artist.name).join(', ')
            || 'Неизвестный исполнитель',
        cover: track.meta?.album?.cover_path ?? null,
    };
}

const prevLine = computed(() =>
    sideLine(
        player.isLocalDeviceActive
            ? player.previewPreviousTrack
            : null,
        'Предыдущий трек',
    ),
);

const nextLine = computed(() =>
    sideLine(
        player.isLocalDeviceActive
            ? player.previewNextTrack
            : null,
        'Следующий трек',
    ),
);

const currentSlideStyle = computed(() => {
    // Покой: transform: none — иначе любое значение transform
    // (даже нулевое) ломает position: fixed у выпадающего
    // меню трека внутри карточки.
    if (dragOffset.value === 0) {
        return { transform: 'none' };
    }

    return { transform: `translate3d(${dragOffset.value}px, 0, 0)` };
});

const prevSlideStyle = computed(() => ({
    transform: `translate3d(calc(-100% + ${dragOffset.value}px), 0, 0)`,
}));

const nextSlideStyle = computed(() => ({
    transform: `translate3d(calc(100% + ${dragOffset.value}px), 0, 0)`,
}));

function onSwipePointerDown(event: PointerEvent): void {
    // Мышь — только левой кнопкой; trailing click после драга
    // глушится флагом swipeFired в handlePlayerSurfaceClick/onBackdropClick.
    if (event.pointerType === 'mouse' && event.button !== 0) {
        return;
    }

    // Пока карточка вылетает по завершённому свайпу — новый
    // жест не начинаем.
    if (slideCommit.value) {
        return;
    }

    const target = event.target;

    if (!(target instanceof Element)) {
        return;
    }

    // На элементах управления свайп не начинаем: у ползунков
    // свои drag-жесты, у кнопок — короткие нажатия.
    if (
        target.closest(
            'button, input, a, .seek-bar, .device-menu, .volume-slider-popover, .track-menu-wrap',
        )
    ) {
        return;
    }

    swipeStart.value = {
        x: event.clientX,
        y: event.clientY,
        pointerId: event.pointerId,
    };
}

function onSwipePointerMove(event: PointerEvent): void {
    const start = swipeStart.value;

    if (!start || start.pointerId !== event.pointerId) {
        return;
    }

    const deltaX = event.clientX - start.x;
    const deltaY = event.clientY - start.y;

    if (!isTrackDragging.value) {
        // Жест ещё не определён: ждём явного горизонтального
        // сдвига, вертикаль оставляем прокрутке страницы.
        if (Math.abs(deltaX) < 10 || Math.abs(deltaX) < Math.abs(deltaY) * 1.5) {
            return;
        }

        if (!player.currentTrack) {
            return;
        }

        isTrackDragging.value = true;
    }

    dragOffset.value = deltaX;
}

function onSwipePointerUp(event: PointerEvent): void {
    const start = swipeStart.value;

    swipeStart.value = null;

    if (!start || start.pointerId !== event.pointerId) {
        return;
    }

    const deltaX = event.clientX - start.x;
    const deltaY = event.clientY - start.y;

    if (isTrackDragging.value) {
        isTrackDragging.value = false;
        releaseTrackDrag(deltaX);
        return;
    }

    // Резкий короткий свайп без визуального драга: прежнее
    // поведение, только на заметной длине.
    if (
        Math.abs(deltaX) < SWIPE_MIN_DISTANCE ||
        Math.abs(deltaX) < Math.abs(deltaY) * 2
    ) {
        return;
    }

    if (!player.currentTrack || player.isLoading) {
        return;
    }

    swipeFired = true;

    if (deltaX < 0) {
        void player.playNext();
    } else {
        void player.playPrevious();
    }
}

function releaseTrackDrag(deltaX: number): void {
    const width = nowSliderRef.value?.clientWidth ?? 320;
    const threshold = Math.min(SWIPE_MIN_DISTANCE, width * 0.3);

    if (
        Math.abs(deltaX) < threshold ||
        !player.currentTrack ||
        player.isLoading
    ) {
        // Не дотянул — текущий трек возвращается на место.
        dragOffset.value = 0;
        return;
    }

    swipeFired = true;

    const direction = deltaX < 0 ? 'next' : 'prev';

    slideCommit.value = direction;

    // Карточка улетает за край, соседняя встаёт на её место.
    dragOffset.value = direction === 'next' ? -width : width;

    if (direction === 'next') {
        void player.playNext();
    } else {
        void player.playPrevious();
    }

    // Страховка: если трек не сменился (конец списка без
    // повтора и т.п.) — карточка возвращается.
    setTimeout(() => {
        if (slideCommit.value === direction) {
            slideCommit.value = null;
            dragOffset.value = 0;
        }
    }, 500);
}

function onSwipePointerCancel(event: PointerEvent): void {
    if (
        swipeStart.value &&
        event.pointerId !== undefined &&
        swipeStart.value.pointerId !== event.pointerId
    ) {
        return;
    }

    swipeStart.value = null;

    if (isTrackDragging.value) {
        isTrackDragging.value = false;
        dragOffset.value = 0;
    }
}

// Трек сменился: позиции слайдера сбрасываем БЕЗ анимации —
// на экране уже тот трек, что только что подъехал сбоку.
watch(() => player.currentTrack?.id, () => {
    if (dragOffset.value === 0 && !slideCommit.value) {
        return;
    }

    slideCommit.value = null;
    dragOffset.value = 0;
    isTrackDragging.value = true;

    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            isTrackDragging.value = false;
        });
    });
});

// Драг может увести палец за пределы футера — слушаем
// движение и отпускание на window.
function bindSwipeListeners(): void {
    window.addEventListener('pointermove', onSwipePointerMove);
    window.addEventListener('pointerup', onSwipePointerUp);
    window.addEventListener('pointercancel', onSwipePointerCancel);
}

function unbindSwipeListeners(): void {
    window.removeEventListener('pointermove', onSwipePointerMove);
    window.removeEventListener('pointerup', onSwipePointerUp);
    window.removeEventListener('pointercancel', onSwipePointerCancel);
}

// Клик по фону модалки закрывает её, но не после свайпа.
function onBackdropClick(): void {
    if (swipeFired) {
        swipeFired = false;
        return;
    }

    ui.closeTrackDetails();
}

async function selectDevice(deviceId: number): Promise<void> {
  await player.switchDevice(deviceId);

  showDeviceMenu.value = false;
  showCardDeviceMenu.value = false;
}

onMounted(async () => {
  // Кнопка «назад» пульта сначала закрывает оверлеи плеера.
  registerHardwareBackHandler(() => {
    if (ui.trackDetailsOpen) {
      ui.closeTrackDetails();
      return true;
    }

    if (showQueue.value) {
      showQueue.value = false;
      return true;
    }

    if (showDeviceMenu.value) {
      showDeviceMenu.value = false;
      return true;
    }

    if (showCardDeviceMenu.value) {
      showCardDeviceMenu.value = false;
      return true;
    }

    if (downloadMenuOpen.value) {
      downloadMenuOpen.value = false;
      return true;
    }

    if (shareModalOpen.value) {
      shareModalOpen.value = false;
      return true;
    }

    return false;
  });

  await player.initializePlayerDevice();

  if (player.isServerSyncEnabled) {
    player.subscribeToDeviceChanges();
  }

  bindSwipeListeners();
});

onBeforeUnmount(() => {
  unbindSwipeListeners();
});

watch(
    () => Boolean(player.isServerSyncEnabled),
    async (isAuthenticated) => {
      if (isAuthenticated) {
        await player.initializePlayerDevice();
        player.subscribeToDeviceChanges();
      }
    },
);

import type { TrackType } from '@/types/TrackType';
function handleTrackMenuAction(
    track: TrackType,
    action: 'next' | 'queue' | 'favorite',
) {
  switch (action) {
    case 'next':
      // Вызови существующий метод добавления трека следующим.
      break;

    case 'queue':
      // Вызови существующий метод добавления трека в очередь.
      break;

    case 'favorite':
      // Вызови существующий метод переключения избранного.
      break;
  }
}

function handlePlayerSurfaceClick(event: MouseEvent) {
  // После свайпа клик вверх не должен открывать модалку.
  if (swipeFired) {
    swipeFired = false;
    return;
  }

  const target = event.target;

  if (!(target instanceof Element)) return;

  // Не открываем модалку при нажатии на элементы управления
  if (
      target.closest(
          'button, input, a, .track-menu-wrap, .track-context-menu, .track-context-sheet, .device-menu, .volume-control'
      )
  ) {
    return;
  }

  if (player.currentTrack) {
    ui.openTrackDetails();
  }
}
</script>
