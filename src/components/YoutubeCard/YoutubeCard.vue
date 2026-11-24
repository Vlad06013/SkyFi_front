<template>
  <div class="yt-card">
    <div class="yt-head">
      <div class="ico" :class="{ on: isLinked }">
        <svg viewBox="0 0 24 24" fill="currentColor">
          <path d="M21.6 5.7a3 3 0 0 1 2.9 3.1c.3 1.6.3 3.2.3 3.2s0 1.6-.3 3.2a3 3 0 0 1-2.9 3.1C20 18.7 12 18.7 12 18.7s-8 0-9.6-.4a3 3 0 0 1-2.9-3.1C1.8 14.6 1.8 13 1.8 13s0-1.6.3-3.2a3 3 0 0 1 2.9-3.1C6.4 6.3 12 6.3 12 6.3s5.6 0 7.6.4z" />
          <path d="M10 9.5v5l4.8-2.5L10 9.5z" fill="var(--color-surface-3)" />
        </svg>
      </div>
      <div class="track-meta">
        <div class="track-title">YouTube</div>
        <div class="track-artist">{{ statusLine }}</div>
      </div>
      <button v-if="hasCookies" class="btn btn-ghost sm" type="button" :disabled="busy" @click="remove">
        Удалить
      </button>
    </div>

    <div v-if="hasCookies === null && !loadFailed" style="display:flex;justify-content:center;padding:18px 0 4px">
      <svg class="spin" style="width:22px;height:22px;color:var(--color-accent)" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
        <circle cx="12" cy="12" r="8" opacity=".25" />
        <path d="M12 4a8 8 0 0 1 8 8" stroke-linecap="round" />
      </svg>
    </div>

    <template v-else-if="loadFailed">
      <p class="caption">Не удалось проверить статус. Проверьте соединение и попробуйте снова.</p>
      <button class="btn btn-ghost wide" type="button" @click="refresh">Повторить</button>
    </template>

    <template v-else>
      <p class="caption">
        {{
          hasCookies
            ? `Cookies загружены · обновлены ${updatedLabel}`
            : 'Без cookies видео с YouTube может прерываться или требовать проверку «вы не робот».'
        }}
      </p>

      <button class="yt-toggle" type="button" :aria-expanded="hintOpen" @click="hintOpen = !hintOpen">
        <span>Как достать cookies</span>
        <svg class="chev" :class="{ open: hintOpen }" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <path d="m6.5 9.5 5.5 5.5 5.5-5.5" />
        </svg>
      </button>

      <div v-if="hintOpen" class="yt-hint">
        <p class="yt-warn">
          Не используйте свой основной аккаунт Google. Файл cookies даёт доступ к аккаунту,
          а он хранится на нашем сервере — заведите отдельный аккаунт и выгружайте куки из него.
        </p>
        <ol class="yt-steps">
          <li>Установите в браузере расширение «Get cookies.txt LOCALLY».</li>
          <li>Войдите на youtube.com в отдельном аккаунте.</li>
          <li>Нажмите на иконку расширения → Export, сохранится файл cookies.txt.</li>
          <li>Загрузите этот файл сюда.</li>
        </ol>
      </div>

      <button class="btn btn-primary wide" type="button" :disabled="busy" @click="pickFile">
        {{ busy ? 'Загружаем…' : hasCookies ? 'Загрузить новый файл' : 'Загрузить cookies' }}
      </button>
      <input ref="fileInput" type="file" accept=".txt,text/plain" hidden @change="onFilePicked">
    </template>
  </div>
</template>

<script src="./YoutubeCard.ts" lang="ts"></script>
