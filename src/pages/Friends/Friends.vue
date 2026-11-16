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
      <div class="sec-label">Друзья</div>
      <button
        v-for="friend in mockFriends"
        :key="friend.id"
        class="friend-row"
        type="button"
        @click="openFriend(friend.id)"
      >
        <div class="avatar ini" :class="friend.tone">{{ friend.initial }}</div>
        <div class="track-meta">
          <div class="track-title">{{ friend.name }}</div>
          <div v-if="friend.live" class="live">{{ friend.live }}</div>
          <div v-else class="idle">{{ friend.idle }}</div>
        </div>
        <span v-if="friend.live && !friend.watching" class="eq" aria-hidden="true"><i /><i /><i /></span>
      </button>
    </template>

    <template v-else>
      <div v-for="friend in filtered()" :key="friend.id" class="friend-row">
        <div class="avatar ini" :class="friend.tone">{{ friend.initial }}</div>
        <div class="track-meta">
          <div class="track-title">{{ friend.name }}</div>
          <div class="idle">{{ friend.email }}</div>
        </div>
        <span class="muted-pill">Друзья</span>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { storeToRefs } from 'pinia';
import { useRouter } from 'vue-router';
import AppBar from '@/components/AppBar/AppBar.vue';
import { mockFriends } from '@/mocks/friends';
import { useNotificationsStore } from '@/stores/notifications';

const router = useRouter();
const query = ref('');
const focused = ref(false);
const notifications = useNotificationsStore();
const { request } = storeToRefs(notifications);
const { accept, decline } = notifications;

const filtered = () => {
  const q = query.value.trim().toLowerCase();
  if (!q) return mockFriends;
  return mockFriends.filter(
    (f) => f.name.toLowerCase().includes(q) || f.email.toLowerCase().includes(q),
  );
};

function openFriend(id: number) {
  router.push(`/friends/${id}`);
}

</script>
<style scoped src="./Friends.css"></style>
