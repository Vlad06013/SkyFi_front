<template>
  <ContextMenu :open="open" :top="top" :right="right" @close="emit('close')">
    <template v-if="variant === 'track'">
      <button type="button" @click="emit('action', 'queue')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <path d="M3 6h11M3 12h11M3 18h6.5" />
          <path d="M13.6 7 22 12l-8.4 5z" fill="currentColor" stroke="none" />
        </svg>
        В очередь
      </button>
      <button type="button" @click="emit('action', 'friend-queue')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="8.2" cy="8" r="3.1" />
          <path d="M3.4 19c.6-2.8 2.5-4.2 4.8-4.2s4.2 1.4 4.8 4.2" />
          <path d="M14.2 10.2 21.2 14.2 14.2 18.2z" fill="currentColor" stroke="none" />
        </svg>
        В очередь другу
      </button>
      <button type="button" @click="emit('action', 'like')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 20s-7-4.3-9-9c-1.2-2.8.6-6 3.8-6C9 5 12 8 12 8s3-3 5.2-3C20.4 5 22.2 8.2 21 11c-2 4.7-9 9-9 9z" />
        </svg>
        В избранное
      </button>
      <button type="button" @click="emit('action', 'playlist')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <path d="M3 6h12M3 12h8" />
          <path d="M18 10.5v11M12.5 16h11" stroke-width="2.4" />
        </svg>
        В плейлист
      </button>
      <button type="button" @click="emit('action', 'download')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 4v9m0 0 3.5-3.5M12 13 8.5 9.5" />
          <path d="M5 17h14" />
        </svg>
        Скачать
      </button>
      <button type="button" @click="emit('action', 'share')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <path d="M8 9.5H6.5A2.5 2.5 0 0 0 4 12v7.5A2.5 2.5 0 0 0 6.5 22h11a2.5 2.5 0 0 0 2.5-2.5V12a2.5 2.5 0 0 0-2.5-2.5H16" />
          <path d="M12 15.5V3m0 0 3.6 3.6M12 3 8.4 6.6" />
        </svg>
        Поделиться
      </button>
    </template>

    <template v-else-if="variant === 'now'">
      <button type="button" @click="emit('action', 'friend-queue')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="8.2" cy="8" r="3.1" />
          <path d="M3.4 19c.6-2.8 2.5-4.2 4.8-4.2s4.2 1.4 4.8 4.2" />
          <path d="M14.2 10.2 21.2 14.2 14.2 18.2z" fill="currentColor" stroke="none" />
        </svg>
        В очередь другу
      </button>
      <button type="button" @click="emit('action', 'playlist')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <path d="M3 6h12M3 12h8" />
          <path d="M18 10.5v11M12.5 16h11" stroke-width="2.4" />
        </svg>
        В плейлист
      </button>
      <button type="button" @click="emit('action', 'download')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 4v9m0 0 3.5-3.5M12 13 8.5 9.5" />
          <path d="M5 17h14" />
        </svg>
        Скачать
      </button>
      <button type="button" @click="emit('action', 'share')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <path d="M8 9.5H6.5A2.5 2.5 0 0 0 4 12v7.5A2.5 2.5 0 0 0 6.5 22h11a2.5 2.5 0 0 0 2.5-2.5V12a2.5 2.5 0 0 0-2.5-2.5H16" />
          <path d="M12 15.5V3m0 0 3.6 3.6M12 3 8.4 6.6" />
        </svg>
        Поделиться
      </button>
      <button type="button" @click="emit('action', 'lyrics')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <rect x="6" y="3.5" width="12" height="17" rx="1.8" />
          <path d="M9 8.4h6M9 12h6M9 15.6h4" />
        </svg>
        Текст
      </button>
      <button type="button" @click="emit('action', 'devices')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <rect x="7" y="2.5" width="10" height="19" rx="2.2" />
          <path d="M10.5 18.6h3" />
        </svg>
        Устройства
      </button>
    </template>

    <template v-else-if="variant === 'own-playlist'">
      <button type="button" @click="emit('action', 'edit')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <path d="M4 7h16M9 7V5.8A1.8 1.8 0 0 1 10.8 4h2.4A1.8 1.8 0 0 1 15 5.8V7M7 7l.8 13h8.4L17 7" />
        </svg>
        Изменить
      </button>
      <button class="bad" type="button" @click="emit('action', 'delete')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
          <path d="M5 5l14 14M19 5 5 19" />
        </svg>
        Удалить плейлист
      </button>
    </template>

    <template v-else>
      <button type="button" @click="emit('action', 'listen')">
        <svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.5v13l11-6.5z" /></svg>
        Слушать
      </button>
      <button type="button" @click="emit('action', 'like')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 20s-7-4.3-9-9c-1.2-2.8.6-6 3.8-6C9 5 12 8 12 8s3-3 5.2-3C20.4 5 22.2 8.2 21 11c-2 4.7-9 9-9 9z" />
        </svg>
        В избранное
      </button>
      <button type="button" @click="emit('action', 'share')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <path d="M8 9.5H6.5A2.5 2.5 0 0 0 4 12v7.5A2.5 2.5 0 0 0 6.5 22h11a2.5 2.5 0 0 0 2.5-2.5V12a2.5 2.5 0 0 0-2.5-2.5H16" />
          <path d="M12 15.5V3m0 0 3.6 3.6M12 3 8.4 6.6" />
        </svg>
        Поделиться
      </button>
    </template>
  </ContextMenu>
</template>

<script src="./EntityMenu.ts" lang="ts"></script>
