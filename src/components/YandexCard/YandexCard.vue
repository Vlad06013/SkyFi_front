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
        v-if="connected"
        class="btn btn-ghost sm"
        type="button"
        :disabled="busy"
        @click="disconnect"
      >
        Отключить
      </button>
    </div>

    <div v-if="connected === null && !loadFailed" style="display:flex;justify-content:center;padding:18px 0 4px">
      <svg class="spin" style="width:22px;height:22px;color:var(--color-accent)" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
        <circle cx="12" cy="12" r="8" opacity=".25" />
        <path d="M12 4a8 8 0 0 1 8 8" stroke-linecap="round" />
      </svg>
    </div>

    <template v-else-if="loadFailed">
      <p class="caption">Не удалось проверить подключение. Проверьте соединение и попробуйте снова.</p>
      <button class="btn btn-ghost wide" type="button" @click="refresh">Повторить</button>
    </template>

    <template v-else-if="awaiting">
      <p class="caption">Скопируйте код, перейдите по ссылке и введите его на странице Яндекса — подключение подтвердится само.</p>
      <div class="ym-code">
        <div class="track-meta">
          <div class="l">Код</div>
          <div class="n">{{ userCode ?? 'получаем…' }}</div>
        </div>
        <button class="icon-btn" type="button" aria-label="скопировать код" :disabled="!userCode" @click="copy(userCode, 'Код')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <rect x="9" y="9" width="11" height="11" rx="2" />
            <path d="M5 15V7a2 2 0 0 1 2-2h8" />
          </svg>
        </button>
      </div>
      <div class="ym-link">
        <div class="track-meta">
          <div class="l">Ссылка</div>
          <div class="url">{{ verificationUrl ?? 'получаем…' }}</div>
        </div>
        <button class="icon-btn" type="button" aria-label="скопировать ссылку" :disabled="!verificationUrl" @click="copy(verificationUrl, 'Ссылка')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <rect x="9" y="9" width="11" height="11" rx="2" />
            <path d="M5 15V7a2 2 0 0 1 2-2h8" />
          </svg>
        </button>
      </div>
      <a v-if="verificationUrl" class="btn btn-primary wide" :href="verificationUrl" target="_blank" rel="noopener">Открыть страницу Яндекса</a>
      <button class="btn btn-ghost wide" type="button" :disabled="busy" @click="connect">Перезапросить код</button>
    </template>

    <template v-else-if="expired">
      <p class="caption">Время кода вышло или сессия не завершена. Запросите код заново.</p>
      <button class="btn btn-primary wide" type="button" :disabled="busy" @click="connect">Перезапросить код</button>
    </template>

    <template v-else-if="connected">
      <p class="caption">Волна и импорт лайков работают на этом аккаунте.</p>
    </template>

    <template v-else>
      <p class="caption">Волна и импорт живут на аккаунте Яндекса. Поиск и свои файлы уже работают.</p>
      <button class="btn btn-primary wide" type="button" :disabled="busy" @click="connect">Подключить</button>
    </template>
  </div>
</template>

<script src="./YandexCard.ts" lang="ts"></script>
