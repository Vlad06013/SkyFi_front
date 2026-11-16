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
        <span class="numeric">{{ volume }}</span>
      </div>
      <div class="progress">
        <div class="fill" :style="{ width: volume + '%' }" />
        <div class="knob" :style="{ left: volume + '%' }" />
      </div>
    </div>

    <div class="sec-label">Приложение</div>
    <div class="set-row">
      <div class="track-meta"><div class="track-title">Выйти</div></div>
      <button class="btn btn-ghost sm" type="button" @click="logout">Выйти</button>
    </div>

    <div v-if="editing" class="sheet-mask" @click.self="editing = false">
      <div class="sheet">
        <div class="handle" />
        <div class="sheet-title">Имя</div>
        <form class="up-form" @submit.prevent="saveName">
          <label>Как к вам обращаться</label>
          <div class="field is-focus">
            <input v-model="draft">
          </div>
          <button class="btn btn-primary" type="submit" style="width:100%;justify-content:center;margin-top:4px">
            Сохранить
          </button>
        </form>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { storeToRefs } from 'pinia';
import AppBar from '@/components/AppBar/AppBar.vue';
import { useAuthStore } from '@/stores/auth';

const router = useRouter();
const auth = useAuthStore();
const { user } = storeToRefs(auth);
const editing = ref(false);
const draft = ref(user.value?.name ?? '');
const volume = ref(72);

function openName() {
  draft.value = user.value?.name ?? '';
  editing.value = true;
}

function saveName() {
  const name = draft.value.trim();
  if (name) auth.rename(name);
  editing.value = false;
}

function logout() {
  auth.logout();
  router.push('/login');
}
</script>
<style scoped src="./Settings.css"></style>
