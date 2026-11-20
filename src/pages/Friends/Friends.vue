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
      <template v-if="incoming.length">
        <div class="sec-label">Заявки <span>{{ incoming.length }}</span></div>
        <div v-for="entry in incoming" :key="entry.user.id" class="friend-row">
          <div class="avatar ini" :class="friendTone(entry.user.id)">
            <img v-if="entry.user.avatar_url" :src="entry.user.avatar_url" alt="">
            <template v-else>{{ friendInitial(entry.user.name) }}</template>
          </div>
          <div class="track-meta">
            <div class="track-title">{{ entry.user.name }}</div>
            <div class="idle">хочет в друзья</div>
          </div>
          <div class="n-actions">
            <button class="icon-btn ghost ok" type="button" aria-label="принять" @click="accept(entry.user.id)">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5 9.5 17 19 7.5" /></svg>
            </button>
            <button class="icon-btn ghost bad" type="button" aria-label="отклонить" @click="decline(entry.user.id)">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M5 5l14 14M19 5 5 19" /></svg>
            </button>
          </div>
        </div>
      </template>

      <div class="sec-label">Друзья <span>{{ friends.length }}</span></div>
      <button
        v-for="entry in friends"
        :key="entry.user.id"
        class="friend-row"
        type="button"
        @click="openFriend(entry.user.id)"
      >
        <div class="avatar ini" :class="friendTone(entry.user.id)">
          <img v-if="entry.user.avatar_url" :src="entry.user.avatar_url" alt="">
          <template v-else>{{ friendInitial(entry.user.name) }}</template>
        </div>
        <div class="track-meta">
          <div class="track-title">{{ entry.user.name }}</div>
          <div v-if="entry.live" class="live">{{ entry.live }}</div>
        </div>
        <div
          v-if="entry.watching && entry.user.current_snapshot?.type === 'video'"
          class="now-prev"
          aria-hidden="true"
        >
          <img :src="entry.user.current_snapshot.cover_url ?? ''" alt="">
          <span class="vid-badge">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <rect x="3" y="6" width="18" height="12" rx="2" />
              <path d="M10.2 9.6v4.8l4.2-2.4z" fill="currentColor" stroke="none" />
            </svg>
          </span>
        </div>
      </button>

      <template v-if="outgoing.length">
        <div class="sec-label">Отправлено <span>{{ outgoing.length }}</span></div>
        <div v-for="entry in outgoing" :key="entry.user.id" class="friend-row">
          <div class="avatar ini" :class="friendTone(entry.user.id)">
            <img v-if="entry.user.avatar_url" :src="entry.user.avatar_url" alt="">
            <template v-else>{{ friendInitial(entry.user.name) }}</template>
          </div>
          <div class="track-meta">
            <div class="track-title">{{ entry.user.name }}</div>
            <div class="idle">заявка отправлена</div>
          </div>
          <button class="btn btn-ghost sm" type="button" @click="cancelOutgoing(entry.user.id)">Отменить</button>
        </div>
      </template>

      <div v-if="loaded && !friends.length && !incoming.length && !outgoing.length" class="empty" style="padding-top:28px">
        <div class="et">Пока пусто</div>
        <div class="es">Найдите друга по имени в строке выше</div>
      </div>
    </template>

    <template v-else>
      <template v-if="requestUsers.length">
        <div class="sec-label">Заявки <span>{{ requestUsers.length }}</span></div>
        <div v-for="user in requestUsers" :key="user.user_id" class="friend-row">
          <div class="avatar ini" :class="friendTone(user.user_id)">
            <img v-if="user.avatar_url" :src="user.avatar_url" alt="">
            <template v-else>{{ friendInitial(user.name) }}</template>
          </div>
          <div class="track-meta">
            <div class="track-title">{{ user.name }}</div>
            <div class="idle">{{ statusKind(user) === 'incoming' ? 'хочет в друзья' : 'заявка отправлена' }}</div>
          </div>
          <div v-if="statusKind(user) === 'incoming'" class="n-actions">
            <button class="icon-btn ghost ok" type="button" aria-label="принять" @click="acceptRequest(user)">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5 9.5 17 19 7.5" /></svg>
            </button>
            <button class="icon-btn ghost bad" type="button" aria-label="отклонить" @click="declineRequest(user)">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M5 5l14 14M19 5 5 19" /></svg>
            </button>
          </div>
          <button v-else class="btn btn-ghost sm" type="button" @click="cancelRequest(user)">Отменить</button>
        </div>
      </template>

      <template v-if="restUsers.length">
        <div class="sec-label">Найдено <span>{{ restUsers.length }}</span></div>
        <button
          v-for="user in restUsers.filter((item) => statusKind(item) === 'friends')"
          :key="user.user_id"
          class="friend-row"
          type="button"
          @click="openFriend(user.user_id)"
        >
          <div class="avatar ini" :class="friendTone(user.user_id)">
            <img v-if="user.avatar_url" :src="user.avatar_url" alt="">
            <template v-else>{{ friendInitial(user.name) }}</template>
          </div>
          <div class="track-meta">
            <div class="track-title">{{ user.name }}</div>
            <div class="idle">{{ user.email }}</div>
          </div>
          <span class="muted-pill">Друзья</span>
        </button>
        <div v-for="user in restUsers.filter((item) => statusKind(item) !== 'friends')" :key="user.user_id" class="friend-row">
          <div class="avatar ini" :class="friendTone(user.user_id)">
            <img v-if="user.avatar_url" :src="user.avatar_url" alt="">
            <template v-else>{{ friendInitial(user.name) }}</template>
          </div>
          <div class="track-meta">
            <div class="track-title">{{ user.name }}</div>
            <div class="idle">{{ user.email }}</div>
          </div>
          <button class="btn btn-primary sm" type="button" @click="addUser(user)">Добавить</button>
        </div>
      </template>

      <div v-if="searchingUsers" class="loading-line">
        <svg class="spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
          <circle cx="12" cy="12" r="8" opacity=".25" />
          <path d="M12 4a8 8 0 0 1 8 8" stroke-linecap="round" />
        </svg>
      </div>
      <div v-else-if="!foundUsers.length && query.trim().length >= 2" class="empty" style="padding-top:20px">
        <div class="et">Никого не нашли</div>
      </div>
    </template>
  </div>
</template>

<script src="./Friends.ts" lang="ts"></script>
<style scoped src="./Friends.css"></style>
