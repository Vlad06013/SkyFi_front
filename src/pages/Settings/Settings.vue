<template>
  <div>
    <AppBar title="Настройки" />
    <div v-if="user" class="friend-row" style="padding:12px 2px 16px">
      <div class="pic-plus round sm" role="button" tabindex="0" aria-label="загрузить фото" @click="pickAvatar" @keydown.enter.prevent="pickAvatar">
        <div class="avatar ini">
          <img v-if="user.avatar_url" :src="user.avatar_url" alt="">
          <template v-else>{{ user.name.slice(0, 1) }}</template>
        </div>
        <span class="plus" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round">
            <path d="M12 5v14M5 12h14" />
          </svg>
        </span>
      </div>
      <input ref="avatarInput" type="file" accept="image/*" hidden @change="onAvatarPicked">
      <div class="track-meta">
        <div class="track-title" style="font-size:16px">{{ user.name }}</div>
        <div class="idle">{{ user.email }}</div>
      </div>
      <button class="icon-btn ghost" type="button" aria-label="изменить имя" @click.stop="openName">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 20h9" />
          <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4z" />
        </svg>
      </button>
    </div>

    <div class="sec-label">Сервисы</div>
    <YandexCard />
    <YoutubeCard />

    <div class="sec-label">Звук</div>
    <div class="vol-row">
      <div class="vol-head">
        <div class="ico">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <path d="M4 9.5v5h3.2L12 18.2V5.8L7.2 9.5H4z" />
            <path d="M15.2 9.1a3.4 3.4 0 0 1 0 5.8" />
            <path d="M17.4 7a6.2 6.2 0 0 1 0 10" />
          </svg>
        </div>
        <div class="track-title">Громкость</div>
        <span class="numeric">{{ Math.round(volume) }}</span>
      </div>
      <SeekBar v-model="volume" label="громкость" />
    </div>

    <div class="sec-label">Приложение</div>
    <SettingRow title="Сканировать QR" idle="вход на ТВ или магнитолу" clickable @open="scanOpen = true">
      <template #icon>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <rect x="3" y="3" width="7" height="7" rx="1" />
          <rect x="14" y="3" width="7" height="7" rx="1" />
          <rect x="3" y="14" width="7" height="7" rx="1" />
          <path d="M14 14h3v3h4v4h-7z" />
        </svg>
      </template>
      <span class="go" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <path d="M9 6.5 15 12l-6 5.5" />
        </svg>
      </span>
    </SettingRow>
    <SettingRow v-if="inApk" :title="updateAvailable ? 'Обновить приложение' : 'Приложение'" :idle="updateIdle">
      <template #icon>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <path d="M20 12a8 8 0 1 1-2.3-5.7" />
          <path d="M20 4v5h-5" />
        </svg>
      </template>
      <button v-if="updateAvailable" class="btn btn-ghost sm" type="button" @click="downloadApk">Обновить</button>
      <button v-else class="btn btn-ghost sm" type="button" :disabled="apkChecking" @click="checkApk">Проверить обновления</button>
    </SettingRow>
    <SettingRow v-else title="Скачать приложение" idle="APK" clickable @open="sheet = 'download'">
      <template #icon>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 4v11" />
          <path d="M8 11.5 12 16l4-4.5" />
          <path d="M5 19h14" />
        </svg>
      </template>
      <span class="go" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <path d="M9 6.5 15 12l-6 5.5" />
        </svg>
      </span>
    </SettingRow>
    <SettingRow
      :title="hasDownloads ? 'Очистить скачанное' : 'Скачанное'"
      :idle="hasDownloads ? downloadedSize : 'ничего нет'"
    >
      <template #icon>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <path d="M5 7h14M10 7V5h4v2M8 7l.7 12h6.6L16 7" />
          <path d="M10 11v5M14 11v5" />
        </svg>
      </template>
      <button v-if="hasDownloads" class="btn btn-danger sm" type="button" @click="askClearDownloads">Очистить</button>
    </SettingRow>

    <div class="logout-wrap">
      <button class="btn btn-danger" type="button" @click="logout">Выйти</button>
    </div>

    <AppSheet :open="Boolean(sheet)" :title="sheet === 'name' ? 'Имя' : 'Скачать SkyFi'" @close="sheet = null">
      <form v-if="sheet === 'name'" class="up-form" @submit.prevent="saveName">
        <label>Как к вам обращаться</label>
        <div class="field is-focus">
          <input v-model="draft">
        </div>
        <button class="btn btn-primary" type="submit" style="width:100%;justify-content:center;margin-top:4px">
          Сохранить
        </button>
      </form>
      <template v-else>
        <SettingRow
          v-for="build in builds"
          :key="build.id"
          :title="build.title"
          :idle="build.idle"
          clickable
          @open="downloadBuild"
        >
          <template #icon>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <rect x="7" y="3" width="10" height="18" rx="2" />
              <path d="M11 18h2" />
            </svg>
          </template>
          <span class="go" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 4v11" />
              <path d="M8 11.5 12 16l4-4.5" />
              <path d="M5 19h14" />
            </svg>
          </span>
        </SettingRow>
      </template>
    </AppSheet>

    <AppConfirm
      :open="confirmClear"
      title="Удалить скачанное?"
      message="Все скачанные треки будут удалены с устройства."
      confirm-label="Удалить"
      @confirm="clearDownloads"
      @close="confirmClear = false"
    />

    <QrScannerSheet :open="scanOpen" @close="scanOpen = false" @scanned="onScanned" />
  </div>
</template>

<script src="./Settings.ts" lang="ts"></script>
<style scoped src="./Settings.css"></style>
