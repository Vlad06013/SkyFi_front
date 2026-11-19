<template>
  <div class="sky-shell">
    <div class="sky-body">
      <div class="appbar">
        <button class="back" type="button" aria-label="назад" @click="goBack">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <path d="M14.5 6 8 12.5 14.5 19" />
          </svg>
        </button>
        <div class="logo" style="font-size:16px">Вход на ТВ</div>
        <span style="width:36px" />
      </div>

      <div class="empty" style="padding-top:36px">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
          <rect x="3" y="3" width="7" height="7" rx="1" />
          <rect x="14" y="3" width="7" height="7" rx="1" />
          <rect x="3" y="14" width="7" height="7" rx="1" />
          <path d="M14 14h3v3h4v4h-7z" />
        </svg>
        <div class="et">Наведите камеру на QR</div>
        <div class="es">Код с экрана ТВ или магнитолы. После подтверждения пульт залогинится сам.</div>
      </div>

      <div v-if="state === 'ready'" class="cta-card">
        <div class="track-title">Устройство просит вход</div>
        <p>Код действует несколько минут.</p>
        <button class="btn btn-primary" type="button" style="width:100%;justify-content:center" :disabled="pending" @click="confirm">
          {{ pending ? 'Подтверждаем…' : 'Подтвердить' }}
        </button>
      </div>
      <div v-else-if="state === 'done'" class="cta-card">
        <div class="track-title">Вход подтверждён</div>
        <p>Устройство залогинилось — можно вернуться к себе.</p>
      </div>
      <div v-else class="cta-card">
        <div class="track-title">Код не найден или устарел</div>
        <p>Сгенерируйте QR заново на устройстве, с которого входите.</p>
      </div>
    </div>
  </div>
</template>

<script src="./QrConfirm.ts" lang="ts"></script>

<style scoped src="./QrConfirm.css"></style>
