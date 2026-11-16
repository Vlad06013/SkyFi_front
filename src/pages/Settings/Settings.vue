<template>
  <div>
    <AppBar title="Настройки" />
    <button v-if="user" class="friend-row" type="button" style="padding:12px 2px 16px" @click="openName">
      <div class="pic-plus round sm">
        <div class="avatar ini">{{ user.name.slice(0, 1) }}</div>
        <span class="plus" aria-label="загрузить фото">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round">
            <path d="M12 5v14M5 12h14" />
          </svg>
        </span>
      </div>
      <div class="track-meta">
        <div class="track-title" style="font-size:16px">{{ user.name }}</div>
        <div class="idle">{{ user.email }}</div>
      </div>
      <span class="go" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <path d="M9 6.5 15 12l-6 5.5" />
        </svg>
      </span>
    </button>

    <div class="sec-label">Сервисы</div>
    <div class="ym-card">
      <div class="ym-head">
        <div class="ico on">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <circle cx="11" cy="13.6" r="8.4" fill="none" stroke="currentColor" stroke-width="1.8" />
            <circle cx="9.6" cy="14.8" r="3.7" />
            <path d="M12.7 5.6h2.05v9.4H12.7z" />
            <path d="M14.75 5.6h6.3l-1.7 3.7h-6.3z" />
          </svg>
        </div>
        <div class="track-meta">
          <div class="track-title">Яндекс Музыка</div>
          <div class="track-artist">подключён</div>
        </div>
        <button class="btn btn-ghost sm" type="button">Отключить</button>
      </div>
      <div class="ym-stats">
        <div class="ym-stat"><div class="n">1 248</div><div class="l">треков</div></div>
        <div class="ym-stat"><div class="n">86</div><div class="l">альбомов</div></div>
        <div class="ym-stat"><div class="n">12</div><div class="l">плейлистов</div></div>
        <div class="ym-stat"><div class="n">41</div><div class="l">исполнителей</div></div>
      </div>
      <button class="btn btn-primary wide" type="button">Импортировать</button>
    </div>

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
    <SettingRow
      v-if="appLatest"
      title="Приложение"
      idle="1.5.0 · последняя"
      on
    >
      <template #icon>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M5 12.5 9.5 17 19 7.5" />
        </svg>
      </template>
      <span class="muted-pill">актуально</span>
    </SettingRow>
    <SettingRow v-else title="Обновить приложение" idle="1.4.2 → 1.5.0">
      <template #icon>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <path d="M20 12a8 8 0 1 1-2.3-5.7" />
          <path d="M20 4v5h-5" />
        </svg>
      </template>
      <button class="btn btn-ghost sm" type="button" @click="updateApp">Обновить</button>
    </SettingRow>
    <SettingRow title="Скачать приложение" idle="APK · Linux · Windows" clickable @open="sheet = 'download'">
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
      :title="downloadedGb ? 'Очистить скачанное' : 'Скачанное'"
      :idle="downloadedGb ? '1,2 ГБ' : 'ничего нет'"
    >
      <template #icon>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <path d="M5 7h14M10 7V5h4v2M8 7l.7 12h6.6L16 7" />
          <path d="M10 11v5M14 11v5" />
        </svg>
      </template>
      <button v-if="downloadedGb" class="btn btn-danger sm" type="button" @click="clearDownloads">Очистить</button>
    </SettingRow>

    <div class="logout-wrap">
      <button class="logout-pill" type="button" @click="logout">Выйти</button>
    </div>

    <div v-if="sheet" class="sheet-mask" @click.self="sheet = null">
      <div class="sheet">
        <div class="handle" />
        <div class="sheet-title">{{ sheet === 'name' ? 'Имя' : 'Скачать SkyFi' }}</div>
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
            @open="downloadBuild(build.title)"
          >
            <template #icon>
              <svg v-if="build.id === 'apk'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                <rect x="7" y="3" width="10" height="18" rx="2" />
                <path d="M11 18h2" />
              </svg>
              <svg v-else-if="build.id === 'linux'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                <rect x="3" y="5" width="18" height="14" rx="2" />
                <path d="m7 10 3 2-3 2" />
                <path d="M13 14h4" />
              </svg>
              <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
                <rect x="4" y="4" width="7" height="7" rx="1" />
                <rect x="13" y="4" width="7" height="7" rx="1" />
                <rect x="4" y="13" width="7" height="7" rx="1" />
                <rect x="13" y="13" width="7" height="7" rx="1" />
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
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { storeToRefs } from 'pinia';
import AppBar from '@/components/AppBar/AppBar.vue';
import SeekBar from '@/components/SeekBar/SeekBar.vue';
import SettingRow from '@/components/SettingRow/SettingRow.vue';
import { useAuthStore } from '@/stores/auth';
import { usePlayerStore } from '@/stores/player';
import { useToastStore } from '@/stores/toast';

const router = useRouter();
const auth = useAuthStore();
const { user } = storeToRefs(auth);
const { volume } = storeToRefs(usePlayerStore());
const toast = useToastStore();
const sheet = ref<'name' | 'download' | null>(null);
const draft = ref(user.value?.name ?? '');
const appLatest = ref(false);
const downloadedGb = ref(1.2);
const builds = [
  { id: 'apk', title: 'Android · APK', idle: 'телефон, ТВ, магнитола' },
  { id: 'linux', title: 'Linux', idle: 'AppImage' },
  { id: 'windows', title: 'Windows', idle: 'установщик' },
] as const;

function openName() {
  draft.value = user.value?.name ?? '';
  sheet.value = 'name';
}

function saveName() {
  const name = draft.value.trim();
  if (name) auth.rename(name);
  sheet.value = null;
}

function updateApp() {
  appLatest.value = true;
  toast.show('SkyFi 1.5.0', 'обновлено');
}

function downloadBuild(title: string) {
  sheet.value = null;
  toast.show(title, 'скачиваем');
}

function clearDownloads() {
  downloadedGb.value = 0;
  toast.show('Скачанное', 'очищено');
}

function logout() {
  auth.logout();
  router.push('/login');
}
</script>
<style scoped src="./Settings.css"></style>
