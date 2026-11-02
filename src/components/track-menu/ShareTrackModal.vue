<template>
  <Teleport to="body">
    <div
        class="share-backdrop"
        @click.self="close"
    >
      <section
          class="share-modal"
          role="dialog"
          aria-modal="true"
          aria-label="Поделиться треком"
          @click.stop
          @pointerdown.stop
      >
        <header class="share-header">
          <div class="share-track-info">
            <strong>{{ track.title }}</strong>

            <span>
              {{
                track.meta?.artists?.map(artist => artist.name).join(', ')
                || 'Неизвестный исполнитель'
              }}
            </span>
          </div>

          <button
              type="button"
              class="share-close"
              aria-label="Закрыть"
              @click="close"
          >
            <ion-icon :icon="closeOutline" />
          </button>
        </header>

        <div class="share-search">
          <ion-icon :icon="searchOutline" class="share-search__icon" />

          <input
              v-model="searchQuery"
              type="text"
              class="share-search__input"
              placeholder="Имя друга"
              autocomplete="off"
          >
        </div>

        <div class="share-body">
          <p v-if="isLoading" class="share-status">
            <ion-spinner name="crescent" />
            Загружаем друзей...
          </p>

          <div
              v-else-if="loadError"
              class="share-status share-status--error"
          >
            <span>{{ loadError }}</span>

            <button
                type="button"
                class="share-retry"
                @click="reload"
            >
              Повторить
            </button>
          </div>

          <template v-else>
            <p v-if="!friendList.length" class="share-status">
              {{
                searchQuery.trim().length >= 2
                    ? 'Никого не нашли. Попробуй другой запрос.'
                    : 'Пока нет друзей. Найди их на странице «Друзья».'
              }}
            </p>

            <button
                v-for="friend in friendList"
                :key="friend.id"
                type="button"
                class="share-friend"
                :disabled="sharingToId !== null"
                @click="shareWith(friend)"
            >
              <span class="share-friend__initial">
                {{ friend.name.charAt(0).toUpperCase() }}
              </span>

              <span class="share-friend__name">{{ friend.name }}</span>

              <ion-spinner
                  v-if="sharingToId === friend.id"
                  name="crescent"
              />

              <ion-icon
                  v-else-if="sharedWithId === friend.id"
                  :icon="checkmarkOutline"
                  class="share-friend__done"
              />
            </button>

            <p v-if="shareError" class="share-status share-status--error">
              {{ shareError }}
            </p>
          </template>
        </div>
      </section>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import {computed, onBeforeUnmount, onMounted, ref, watch} from 'vue';
import {IonIcon, IonSpinner} from '@ionic/vue';
import {
  checkmarkOutline,
  closeOutline,
  searchOutline,
} from 'ionicons/icons';
import axios from 'axios';

import {getFriends, shareTrackWithFriend} from '@/api/friends';
import {useAuthStore} from '@/stores/auth';
import useFriendsStore from '@/stores/friends';
import type {Track} from '@/types/TrackType';

const props = defineProps<{
  track: Track;
}>();

const emit = defineEmits<{
  (event: 'close'): void;
}>();

const auth = useAuthStore();
const friendsStore = useFriendsStore();

const searchQuery = ref('');
const isLoading = ref(false);
const loadError = ref('');
const shareError = ref('');

const searchResults = ref<FriendEntry[]>([]);
const searched = ref(false);

const sharingToId = ref<number | null>(null);
const sharedWithId = ref<number | null>(null);

interface FriendEntry {
  id: number;
  name: string;
}

function toFriendEntry(friendship: {
  sender: {id: number; name: string};
  receiver: {id: number; name: string};
  status: string;
}): FriendEntry | null {
  if (friendship.status !== 'ACCEPTED') return null;

  const isSender = friendship.sender.id === auth.user?.id;

  const counterpart = isSender
      ? friendship.receiver
      : friendship.sender;

  return {id: counterpart.id, name: counterpart.name};
}

/** Список для показа: без запроса — друзья из стора, иначе результаты поиска. */
const friendList = computed<FriendEntry[]>(() => {
  if (searchQuery.value.trim().length >= 2) {
    return searchResults.value;
  }

  const entries: FriendEntry[] = [];

  for (const friendship of friendsStore.friends) {
    const entry = toFriendEntry(friendship);

    if (entry) entries.push(entry);
  }

  return entries;
});

async function reload(): Promise<void> {
  loadError.value = '';
  isLoading.value = true;

  try {
    await friendsStore.ensureInitialized();
  } catch (err: unknown) {
    console.error(
        '[ShareTrack] Не удалось загрузить друзей:',
        err,
    );

    loadError.value = axios.isAxiosError(err) && !err.response
        ? 'Не удалось подключиться к серверу.'
        : 'Не удалось загрузить список друзей.';
  } finally {
    isLoading.value = false;
  }
}

let searchTimeout: ReturnType<typeof setTimeout> | null = null;

watch(searchQuery, (query) => {
  if (searchTimeout) {
    clearTimeout(searchTimeout);
  }

  if (query.trim().length < 2) {
    searchResults.value = [];
    searched.value = false;
    return;
  }

  searchTimeout = setTimeout(() => {
    void runSearch(query.trim());
  }, 300);
});

async function runSearch(query: string): Promise<void> {
  isLoading.value = true;
  loadError.value = '';

  try {
    const friendships = await getFriends(query);

    searchResults.value = friendships
        .map(toFriendEntry)
        .filter((entry): entry is FriendEntry => entry !== null);
    searched.value = true;
  } catch (err: unknown) {
    console.error(
        '[ShareTrack] Не удалось найти друзей:',
        err,
    );

    loadError.value = axios.isAxiosError(err) && !err.response
        ? 'Не удалось подключиться к серверу.'
        : 'Не удалось выполнить поиск.';
  } finally {
    isLoading.value = false;
  }
}

async function shareWith(friend: FriendEntry): Promise<void> {
  if (sharingToId.value !== null) return;

  sharingToId.value = friend.id;
  shareError.value = '';

  try {
    await shareTrackWithFriend(friend.id, props.track);

    sharedWithId.value = friend.id;

    if (closeTimer) {
      clearTimeout(closeTimer);
    }

    closeTimer = setTimeout(() => {
      emit('close');
    }, 800);
  } catch (err: unknown) {
    console.error(
        '[ShareTrack] Не удалось поделиться треком:',
        err,
    );

    shareError.value = 'Не удалось отправить. Попробуй ещё раз.';
  } finally {
    sharingToId.value = null;
  }
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    close();
  }
}

function close(): void {
  emit('close');
}

let closeTimer: ReturnType<typeof setTimeout> | null = null;

onMounted(() => {
  document.addEventListener('keydown', onKeydown);

  void reload();
});

onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKeydown);

  if (searchTimeout) {
    clearTimeout(searchTimeout);
  }

  if (closeTimer) {
    clearTimeout(closeTimer);
  }
});
</script>

<style scoped>
.share-backdrop {
  position: fixed;
  z-index: 30000;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  background: #0009;
  animation: share-backdrop-in 0.18s ease;
}

.share-modal {
  display: flex;
  flex-direction: column;
  width: 100%;
  max-width: 400px;
  max-height: min(80dvh, 560px);
  box-sizing: border-box;
  padding: 18px;
  border: 1px solid #303444;
  border-radius: 16px;
  background: #171a23;
  color: #f5f7fa;
  box-shadow: 0 18px 55px #000a;
  animation: share-modal-in 0.2s ease;
}

.share-header {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  margin-bottom: 14px;
}

.share-track-info {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.share-track-info strong {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 14px;
}

.share-track-info span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: #9296a7;
  font-size: 12px;
}

.share-close {
  display: grid;
  flex: 0 0 auto;
  place-items: center;
  width: 34px;
  height: 34px;
  border: 0;
  border-radius: 50%;
  background: #292d3b;
  color: #f5f7fa;
  font-size: 18px;
  cursor: pointer;
}

.share-search {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
  padding: 0 12px;
  border: 1px solid #303444;
  border-radius: 10px;
  background: #11141c;
}

.share-search__icon {
  flex: 0 0 auto;
  color: #9296a7;
  font-size: 16px;
}

.share-search__input {
  flex: 1;
  min-width: 0;
  height: 40px;
  border: 0;
  outline: none;
  background: transparent;
  color: #f5f7fa;
  font: inherit;
  font-size: 13px;
}

.share-search__input::placeholder {
  color: #6b6f80;
}

.share-body {
  flex: 1;
  min-height: 120px;
  overflow-y: auto;
}

.share-status {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 10px 4px;
  color: #9296a7;
  font-size: 12px;
}

.share-status--error {
  color: #fda4af;
  flex-wrap: wrap;
}

.share-retry {
  padding: 4px 10px;
  border: 1px solid #343849;
  border-radius: 8px;
  background: transparent;
  color: #f5f7fa;
  font: inherit;
  font-size: 11px;
  cursor: pointer;
}

.share-retry:hover {
  border-color: #8b5cf6;
}

.share-friend {
  display: flex;
  align-items: center;
  gap: 11px;
  width: 100%;
  min-height: 46px;
  padding: 8px 10px;
  border: 0;
  border-radius: 10px;
  background: transparent;
  color: #e6e7ee;
  font: inherit;
  font-size: 13px;
  text-align: left;
  cursor: pointer;
}

.share-friend:hover:not(:disabled) {
  background: #292d3b;
}

.share-friend:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.share-friend__initial {
  display: grid;
  flex: 0 0 auto;
  place-items: center;
  width: 30px;
  height: 30px;
  border-radius: 50%;
  background: #8b5cf633;
  color: #c4b5fd;
  font-size: 13px;
  font-weight: 700;
}

.share-friend__name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.share-friend__done {
  color: #7ee2a8;
  font-size: 18px;
}

@keyframes share-backdrop-in {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes share-modal-in {
  from {
    opacity: 0;
    transform: translateY(10px) scale(0.98);
  }

  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

@media (prefers-reduced-motion: reduce) {
  .share-backdrop,
  .share-modal {
    animation: none;
  }
}
</style>
