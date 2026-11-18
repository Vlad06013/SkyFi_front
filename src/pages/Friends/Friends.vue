<template>
  <div class="friends-page">
    <AppBar title="Друзья" badge />

    <div class="field" :class="{ 'is-focus': focused }">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
        <circle cx="11" cy="11" r="7" /><path d="M16.5 16.5 21 21" />
      </svg>
      <input
        v-model="query"
        placeholder="имя или email"
        @focus="focused = true"
        @blur="focused = false"
      >
    </div>

    <template v-if="!query">
      <div v-if="request" class="sec-label">Заявки <span>1</span></div>
      <div v-if="request" class="friend-row">
        <div class="avatar ini" :class="request.tone">{{ request.initial }}</div>
        <div class="track-meta">
          <div class="track-title">{{ request.name }}</div>
          <div class="idle">хочет в друзья</div>
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
      <div class="sec-label">Друзья <span>{{ listening.length }}</span></div>
      <button
        v-for="friend in listening"
        :key="friend.id"
        class="friend-row"
        type="button"
        @click="openFriend(friend.id)"
      >
        <div class="avatar ini" :class="friend.tone">{{ friend.initial }}</div>
        <div class="track-meta">
          <div class="track-title">{{ friend.name }}</div>
          <div v-if="friend.live" class="live">{{ friend.live }}</div>
        </div>
        <div
          v-if="friend.watching && friend.current_snapshot?.type === 'video'"
          class="now-prev"
          aria-hidden="true"
        >
          <img :src="friend.current_snapshot.cover_url ?? ''" alt="">
          <span class="vid-badge">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <rect x="3" y="6" width="18" height="12" rx="2" />
              <path d="M10.2 9.6v4.8l4.2-2.4z" fill="currentColor" stroke="none" />
            </svg>
          </span>
        </div>
      </button>
      <div v-if="outgoing" class="friend-row">
        <div class="avatar ini" :class="outgoing.tone">{{ outgoing.initial }}</div>
        <div class="track-meta">
          <div class="track-title">{{ outgoing.name }}</div>
          <div class="idle">заявка отправлена</div>
        </div>
        <button class="btn btn-ghost sm" type="button" @click="cancelOutgoing">Отменить</button>
      </div>
    </template>

    <template v-else>
      <button
        v-for="friend in filtered"
        :key="friend.id"
        class="friend-row"
        type="button"
        @click="openFriend(friend.id)"
      >
        <div class="avatar ini" :class="friend.tone">{{ friend.initial }}</div>
        <div class="track-meta">
          <div class="track-title">{{ friend.name }}</div>
          <div class="idle">{{ friend.email }}</div>
        </div>
        <span class="muted-pill">Друзья</span>
      </button>
    </template>
  </div>
</template>

<script src="./Friends.ts" lang="ts"></script>
<style scoped src="./Friends.css"></style>
