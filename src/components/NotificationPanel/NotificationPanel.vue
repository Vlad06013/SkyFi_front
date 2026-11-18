<template>
  <div v-if="open" class="n-panel n-pop">
    <div class="n-head">
      Уведомления
      <div style="display:flex;align-items:center;gap:12px">
        <span>{{ unreadCount }} непрочитанных</span>
        <button v-if="hasUnread" class="n-readall" type="button" @click="markAllRead">прочитать все</button>
      </div>
    </div>
    <div v-if="request" class="n-row is-unread">
      <div class="avatar ini" :class="request.tone">{{ request.initial }}</div>
      <div class="n-body">
        <div class="n-title">{{ request.name }}</div>
        <div class="n-sub">хочет в друзья</div>
      </div>
      <div class="n-actions">
        <button class="icon-btn ghost ok" type="button" aria-label="принять" @click="accept">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5 9.5 17 19 7.5" /></svg>
        </button>
        <button class="icon-btn ghost bad" type="button" aria-label="отклонить" @click="decline">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M5 5l14 14M19 5 5 19" /></svg>
        </button>
      </div>
    </div>
    <div
      v-for="share in shares"
      :key="share.id"
      class="n-row share"
      :class="{ 'is-unread': share.unread }"
      role="button"
      tabindex="0"
      @click="markRead(share.id)"
      @keydown.enter="markRead(share.id)"
    >
      <div class="thumb" style="background:var(--gradient-cover-1)" />
      <div class="n-body">
        <div class="n-title">{{ share.title }}</div>
        <div class="n-sub">{{ share.sub }}</div>
      </div>
    </div>
  </div>
</template>

<script src="./NotificationPanel.ts" lang="ts"></script>
