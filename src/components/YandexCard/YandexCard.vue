<template>
  <div class="ym-card">
    <div class="ym-head">
      <div class="ico" :class="{ on: isLinked }">
        <svg viewBox="0 0 24 24" fill="currentColor">
          <circle cx="11" cy="13.6" r="8.4" fill="none" stroke="currentColor" stroke-width="1.8" />
          <circle cx="9.6" cy="14.8" r="3.7" />
          <path d="M12.7 5.6h2.05v9.4H12.7z" />
          <path d="M14.75 5.6h6.3l-1.7 3.7h-6.3z" />
        </svg>
      </div>
      <div class="track-meta">
        <div class="track-title">Яндекс Музыка</div>
        <div class="track-artist">{{ statusLine }}</div>
      </div>
      <button
        v-if="ymState === 'connected' || ymState === 'done'"
        class="btn btn-ghost sm"
        type="button"
        @click="disconnect"
      >
        Отключить
      </button>
    </div>

    <template v-if="ymState === 'idle'">
      <p class="caption">Волна и импорт живут на аккаунте Яндекса. Поиск и свои файлы уже работают.</p>
      <button class="btn btn-primary wide" type="button" @click="requestCode">Подключить</button>
    </template>

    <div v-else-if="ymState === 'starting'" style="display:flex;justify-content:center;padding:18px 0 4px">
      <svg class="spin" style="width:22px;height:22px;color:var(--color-accent)" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
        <circle cx="12" cy="12" r="8" opacity=".25" />
        <path d="M12 4a8 8 0 0 1 8 8" stroke-linecap="round" />
      </svg>
    </div>

    <template v-else-if="ymState === 'awaiting'">
      <p class="caption">Скопируйте код, перейдите по ссылке и введите его на странице Яндекса — подключение подтвердится само.</p>
      <div class="ym-code">
        <div class="track-meta">
          <div class="l">Код</div>
          <div class="n">{{ ymCode }}</div>
        </div>
        <button class="icon-btn" type="button" aria-label="скопировать код" @click="copied('Код')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <rect x="9" y="9" width="11" height="11" rx="2" />
            <path d="M5 15V7a2 2 0 0 1 2-2h8" />
          </svg>
        </button>
      </div>
      <div class="ym-link">
        <div class="track-meta">
          <div class="l">Ссылка</div>
          <div class="url">ya.ru/device</div>
        </div>
        <button class="icon-btn" type="button" aria-label="скопировать ссылку" @click="copied('Ссылка')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <rect x="9" y="9" width="11" height="11" rx="2" />
            <path d="M5 15V7a2 2 0 0 1 2-2h8" />
          </svg>
        </button>
      </div>
      <button class="btn btn-ghost wide" type="button" @click="requestCode">Перезапросить код</button>
    </template>

    <template v-else-if="ymState === 'connected'">
      <div class="ym-stats">
        <div class="ym-stat"><div class="n">1 248</div><div class="l">треков</div></div>
        <div class="ym-stat"><div class="n">86</div><div class="l">альбомов</div></div>
        <div class="ym-stat"><div class="n">12</div><div class="l">плейлистов</div></div>
        <div class="ym-stat"><div class="n">41</div><div class="l">исполнителей</div></div>
      </div>
      <button class="btn btn-primary wide" type="button" @click="startImport">Импортировать</button>
    </template>

    <template v-else-if="ymState === 'importing'">
      <div class="ym-progress">
        <div class="ym-progress-head">
          <span>Импортируем</span>
          <span class="ym-progress-pct">{{ importPct }}%</span>
        </div>
        <div class="ym-bar"><i :style="{ width: `${importPct}%` }" /></div>
        <div class="hint">{{ importCount }} из 1 248</div>
      </div>
      <button class="btn btn-ghost wide" type="button" @click="cancelImport">Отменить</button>
    </template>

    <template v-else>
      <div class="ym-done">
        <svg class="mark" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M5 12.5 9.5 17 19 7.5" />
        </svg>
        <div>
          <strong>Импорт завершён</strong>
          <p>1 248 треков · 86 альбомов · 12 плейлистов · 41 исполнитель</p>
        </div>
      </div>
    </template>
  </div>
</template>

<script src="./YandexCard.ts" lang="ts"></script>
