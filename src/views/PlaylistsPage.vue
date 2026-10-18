
<template>
  <ion-page>
    <ion-content :fullscreen="true" class="skyfi-content">
      <main class="page-layout">
        <div class="eyebrow">ТВОЯ МУЗЫКА · ТВОИ ПРАВИЛА</div>

        <div class="page-heading">
          <div>
            <h1>Плейлисты</h1>
            <p class="subtitle">Собирай музыку под любое настроение</p>
          </div>

          <button class="create-button" @click="showCreate = true">
            <ion-icon :icon="addOutline" />
            <span>Создать</span>
          </button>
        </div>

        <div class="playlist-tabs">
          <button
              v-for="tab in tabs"
              :key="tab.value"
              class="tab"
              :class="{ active: activeTab === tab.value }"
              @click="activeTab = tab.value"
          >
            {{ tab.label }}
          </button>
        </div>

        <section v-if="!selectedPlaylist">
          <div class="section-heading">
            <h2>{{ activeTab === 'all' ? 'Твоя коллекция' : 'Недавно открытые' }}</h2>
            <span>{{ visiblePlaylists.length }} плейлиста</span>
          </div>

          <div v-if="visiblePlaylists.length" class="playlist-grid">
            <article
                v-for="playlist in visiblePlaylists"
                :key="playlist.id"
                class="playlist-card"
                @click="openPlaylist(playlist)"
            >
              <div class="playlist-cover" :style="{ '--cover-color': playlist.color }">
                <div class="cover-art">
                  <ion-icon :icon="musicalNotesOutline" />
                </div>
                <button
                    class="cover-play"
                    aria-label="Открыть плейлист"
                    @click.stop="openPlaylist(playlist)"
                >
                  <ion-icon :icon="playOutline" />
                </button>
              </div>

              <div class="playlist-card-info">
                <strong>{{ playlist.name }}</strong>
                <span>{{ playlist.tracks.length }} треков · {{ playlist.description }}</span>
              </div>
            </article>
          </div>

          <div v-else class="empty-state">
            <ion-icon :icon="albumsOutline" />
            <h3>Здесь пока пусто</h3>
            <p>Создай плейлист и собери свою коллекцию музыки.</p>
            <button class="create-button" @click="showCreate = true">
              <ion-icon :icon="addOutline" />
              Создать плейлист
            </button>
          </div>
        </section>

        <section v-else class="playlist-detail">
          <button class="back-button" @click="selectedPlaylist = null">
            <ion-icon :icon="arrowBackOutline" />
            Все плейлисты
          </button>

          <div class="detail-hero">
            <div
                class="detail-cover"
                :style="{ '--cover-color': selectedPlaylist.color }"
            >
              <ion-icon :icon="musicalNotesOutline" />
            </div>

            <div class="detail-info">
              <span class="eyebrow">ПЛЕЙЛИСТ</span>
              <h2>{{ selectedPlaylist.name }}</h2>
              <p>{{ selectedPlaylist.description }}</p>
              <span class="detail-count">
                {{ selectedPlaylist.tracks.length }} треков
              </span>

              <button
                  class="create-button detail-play"
                  :disabled="selectedPlaylist.tracks.length === 0"
                  @click="playPlaylist"
              >
                <ion-icon :icon="playOutline" />
                Слушать
              </button>
            </div>
          </div>

          <div class="section-heading">
            <h2>Композиции</h2>
            <span>{{ selectedPlaylist.tracks.length }} треков</span>
          </div>

          <div v-if="selectedPlaylist.tracks.length" class="track-list">
            <div
                v-for="(track, index) in selectedPlaylist.tracks"
                :key="track.id"
                class="track-row"
            >
              <span class="track-number">{{ index + 1 }}</span>
              <div class="track-cover" :style="{ '--cover-color': track.color }">
                <ion-icon :icon="musicalNotesOutline" />
              </div>
              <div class="track-info">
                <strong>{{ track.title }}</strong>
                <span>{{ track.artist }}</span>
              </div>
              <button
                  class="remove-button"
                  aria-label="Убрать трек из плейлиста"
                  @click="removeTrack(track.id)"
              >
                <ion-icon :icon="closeOutline" />
              </button>
            </div>
          </div>

          <div v-else class="empty-state">
            <ion-icon :icon="musicalNotesOutline" />
            <h3>Плейлист пока пуст</h3>
            <p>Добавь композиции из каталога, когда подключим API.</p>
          </div>
        </section>

        <p class="demo-note">
          <ion-icon :icon="informationCircleOutline" />
          Плейлисты пока демонстрационные и хранятся в памяти страницы.
        </p>
      </main>

      <div v-if="showCreate" class="modal-backdrop" @click.self="closeCreate">
        <form class="create-modal" @submit.prevent="createPlaylist">
          <button
              type="button"
              class="modal-close"
              aria-label="Закрыть"
              @click="closeCreate"
          >
            <ion-icon :icon="closeOutline" />
          </button>

          <div class="modal-icon">
            <ion-icon :icon="albumsOutline" />
          </div>

          <h2>Новый плейлист</h2>
          <p>Создай коллекцию для своего настроения.</p>

          <label for="playlist-name">Название</label>
          <input
              id="playlist-name"
              v-model="newName"
              placeholder="Например, Ночные поездки"
              maxlength="60"
              required
              autofocus
          />

          <label for="playlist-description">Описание</label>
          <input
              id="playlist-description"
              v-model="newDescription"
              placeholder="Музыка для особых моментов"
              maxlength="100"
          />

          <p v-if="formError" class="form-error">{{ formError }}</p>

          <button class="create-button submit-button" type="submit">
            Создать плейлист
          </button>
        </form>
      </div>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { IonContent, IonPage, IonIcon } from '@ionic/vue';
import {
  addOutline,
  albumsOutline,
  arrowBackOutline,
  closeOutline,
  informationCircleOutline,
  musicalNotesOutline,
  playOutline,
} from 'ionicons/icons';

type Track = {
  id: number;
  title: string;
  artist: string;
  color: string;
};

type Playlist = {
  id: number;
  name: string;
  description: string;
  color: string;
  tracks: Track[];
};

const tabs = [
  { label: 'Все плейлисты', value: 'all' },
  { label: 'Недавние', value: 'recent' },
];

const activeTab = ref('all');
const showCreate = ref(false);
const newName = ref('');
const newDescription = ref('');
const formError = ref('');
const selectedPlaylist = ref<Playlist | null>(null);

const demoTracks: Track[] = [
  { id: 1, title: 'Midnight Drive', artist: 'Neon Waves', color: '#6546B8' },
  { id: 2, title: 'Lost in Sound', artist: 'Aurora', color: '#277D8A' },
  { id: 3, title: 'Electric Dreams', artist: 'Digital Soul', color: '#A04C72' },
  { id: 4, title: 'Night Lights', artist: 'Neon Waves', color: '#B26A38' },
];

const playlists = ref<Playlist[]>([
  {
    id: 1,
    name: 'Ночные поездки',
    description: 'Для дороги',
    color: '#6546B8',
    tracks: [demoTracks[0], demoTracks[3]],
  },
  {
    id: 2,
    name: 'Момент тишины',
    description: 'Для отдыха',
    color: '#277D8A',
    tracks: [demoTracks[1]],
  },
  {
    id: 3,
    name: 'Энергия',
    description: 'Для движения',
    color: '#A04C72',
    tracks: [demoTracks[2], demoTracks[0]],
  },
]);

const recentIds = ref<number[]>([2, 1]);

const visiblePlaylists = computed(() => {
  if (activeTab.value === 'recent') {
    return playlists.value.filter(p => recentIds.value.includes(p.id));
  }

  return playlists.value;
});

function openPlaylist(playlist: Playlist) {
  selectedPlaylist.value = playlist;
  recentIds.value = [
    playlist.id,
    ...recentIds.value.filter(id => id !== playlist.id),
  ];
}

function closeCreate() {
  showCreate.value = false;
  newName.value = '';
  newDescription.value = '';
  formError.value = '';
}

function createPlaylist() {
  const name = newName.value.trim();

  if (!name) {
    formError.value = 'Введи название плейлиста.';
    return;
  }

  const playlist: Playlist = {
    id: Date.now(),
    name,
    description: newDescription.value.trim() || 'Моя коллекция',
    color: ['#6546B8', '#277D8A', '#A04C72', '#B26A38'][
    playlists.value.length % 4
        ],
    tracks: [],
  };

  playlists.value.unshift(playlist);
  activeTab.value = 'all';
  selectedPlaylist.value = playlist;
  closeCreate();
}

function removeTrack(trackId: number) {
  if (!selectedPlaylist.value) return;

  selectedPlaylist.value.tracks = selectedPlaylist.value.tracks.filter(
      track => track.id !== trackId,
  );
}

function playPlaylist() {
  if (!selectedPlaylist.value?.tracks.length) return;

  // Настоящее воспроизведение подключим вместе с аудиоплеером.
  alert(`Плейлист «${selectedPlaylist.value.name}» готов к подключению плеера.`);
}
</script>

<style scoped>
.skyfi-content {
  --background: #0b0d12;
  color: #f5f7fa;
}

.page-layout {
  max-width: 1050px;
  margin: 0 auto;
  padding: 42px 36px 100px;
}

.eyebrow {
  color: #a78bfa;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 2px;
}

.page-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  margin: 10px 0 30px;
}

h1 {
  color: #f5f7fa;
  font-size: clamp(30px, 5vw, 42px);
  font-weight: 800;
  letter-spacing: -1.5px;
  margin: 0;
}

.subtitle {
  color: #9296a7;
  margin: 10px 0 0;
  font-size: 14px;
}

.create-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 12px 17px;
  border: 0;
  border-radius: 12px;
  background: #8b5cf6;
  color: white;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  transition: background 0.2s, transform 0.2s;
}

.create-button:hover {
  background: #7c3aed;
  transform: translateY(-1px);
}

.create-button:disabled {
  opacity: 0.45;
  cursor: not-allowed;
  transform: none;
}

.create-button ion-icon {
  font-size: 19px;
}

.playlist-tabs {
  display: flex;
  gap: 9px;
  flex-wrap: wrap;
  margin-bottom: 34px;
}

.tab {
  padding: 10px 16px;
  border: 1px solid #292d3b;
  border-radius: 12px;
  background: #171a23;
  color: #a5a8b7;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}

.tab.active {
  background: #8b5cf6;
  border-color: #8b5cf6;
  color: white;
}

.section-heading {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 18px;
}

h2 {
  color: #f5f7fa;
  font-size: 20px;
  margin: 0;
}

.section-heading span {
  color: #9296a7;
  font-size: 13px;
}

.playlist-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 22px 18px;
}

.playlist-card {
  min-width: 0;
  cursor: pointer;
}

.playlist-cover {
  position: relative;
  display: grid;
  place-items: center;
  aspect-ratio: 1;
  overflow: hidden;
  border: 1px solid #ffffff10;
  border-radius: 17px;
  background:
      radial-gradient(circle at 75% 20%, #ffffff25, transparent 40%),
      linear-gradient(140deg, var(--cover-color), #171a23 100%);
  transition: transform 0.2s;
}

.playlist-card:hover .playlist-cover {
  transform: translateY(-3px);
}

.cover-art {
  display: grid;
  place-items: center;
  width: 92px;
  height: 92px;
  border: 1px solid #ffffff30;
  border-radius: 50%;
  color: #ffffffd9;
  font-size: 42px;
  background: #ffffff0b;
}

.cover-play {
  position: absolute;
  right: 12px;
  bottom: 12px;
  display: grid;
  place-items: center;
  width: 43px;
  height: 43px;
  border: 0;
  border-radius: 50%;
  background: #8b5cf6;
  color: white;
  font-size: 22px;
  opacity: 0;
  transform: translateY(5px);
  transition: opacity 0.2s, transform 0.2s;
  cursor: pointer;
}

.playlist-card:hover .cover-play,
.cover-play:focus-visible {
  opacity: 1;
  transform: translateY(0);
}

.playlist-card-info {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 12px 2px 0;
}

.playlist-card-info strong {
  overflow: hidden;
  color: #f5f7fa;
  font-size: 14px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.playlist-card-info span {
  overflow: hidden;
  color: #9296a7;
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.back-button {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 0;
  margin-bottom: 26px;
  border: 0;
  background: transparent;
  color: #b9a3ff;
  font-size: 13px;
  cursor: pointer;
}

.detail-hero {
  display: flex;
  align-items: center;
  gap: 28px;
  padding: 26px;
  margin-bottom: 34px;
  border: 1px solid #292d3b;
  border-radius: 20px;
  background: linear-gradient(120deg, #171a23, #11131b);
}

.detail-cover {
  display: grid;
  place-items: center;
  flex-shrink: 0;
  width: 190px;
  aspect-ratio: 1;
  border-radius: 17px;
  background: linear-gradient(140deg, var(--cover-color), #171a23);
  color: #ffffffdf;
  font-size: 65px;
}

.detail-info h2 {
  margin: 10px 0;
  font-size: clamp(24px, 4vw, 34px);
  font-weight: 800;
}

.detail-info p {
  color: #9296a7;
  font-size: 14px;
}

.detail-count {
  display: block;
  color: #a5a8b7;
  font-size: 12px;
  margin: 14px 0;
}

.detail-play {
  margin-top: 5px;
}

.track-list {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.track-row {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 10px;
  border-radius: 13px;
}

.track-row:hover {
  background: #171a23;
}

.track-number {
  width: 20px;
  color: #777c8d;
  font-size: 13px;
  text-align: center;
}

.track-cover {
  display: grid;
  place-items: center;
  width: 49px;
  height: 49px;
  border-radius: 10px;
  background: linear-gradient(140deg, var(--cover-color), #171a23);
  color: white;
  font-size: 22px;
}

.track-info {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 5px;
  min-width: 0;
}

.track-info strong {
  color: #f5f7fa;
  font-size: 13px;
}

.track-info span {
  color: #9296a7;
  font-size: 12px;
}

.remove-button,
.modal-close {
  display: grid;
  place-items: center;
  border: 0;
  background: transparent;
  color: #9296a7;
  cursor: pointer;
}

.remove-button {
  width: 38px;
  height: 38px;
  font-size: 20px;
}

.remove-button:hover,
.modal-close:hover {
  color: #f5f7fa;
}

.empty-state {
  padding: 50px 15px;
  text-align: center;
  color: #9296a7;
}

.empty-state > ion-icon {
  font-size: 42px;
  color: #a78bfa;
}

.empty-state h3 {
  color: #f5f7fa;
  margin: 16px 0 8px;
}

.empty-state p {
  font-size: 13px;
  margin-bottom: 20px;
}

.demo-note {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #777c8d;
  font-size: 12px;
  margin-top: 35px;
}

.modal-backdrop {
  position: fixed;
  z-index: 30;
  inset: 0;
  display: grid;
  place-items: center;
  padding: 20px;
  background: #0009;
  backdrop-filter: blur(7px);
}

.create-modal {
  position: relative;
  width: min(440px, 100%);
  padding: 30px;
  border: 1px solid #343043;
  border-radius: 22px;
  background: #171a23;
  box-shadow: 0 25px 80px #0008;
}

.modal-close {
  position: absolute;
  top: 18px;
  right: 18px;
  width: 35px;
  height: 35px;
  font-size: 22px;
}

.modal-icon {
  display: grid;
  place-items: center;
  width: 52px;
  height: 52px;
  border-radius: 16px;
  background: #8b5cf61f;
  color: #b9a3ff;
  font-size: 26px;
  margin-bottom: 20px;
}

.create-modal h2 {
  font-size: 23px;
}

.create-modal > p {
  color: #9296a7;
  font-size: 13px;
  margin: 10px 0 24px;
}

.create-modal label {
  display: block;
  color: #d7d9e2;
  font-size: 12px;
  margin: 16px 0 8px;
}

.create-modal input {
  box-sizing: border-box;
  width: 100%;
  padding: 13px 14px;
  border: 1px solid #343849;
  border-radius: 11px;
  outline: none;
  background: #0b0d12;
  color: #f5f7fa;
  font: inherit;
  font-size: 13px;
}

.create-modal input:focus {
  border-color: #8b5cf6;
}

.create-modal .form-error {
  color: #fda4af;
  margin: 12px 0;
}

.submit-button {
  width: 100%;
  margin-top: 22px;
}

@media (max-width: 700px) {
  .page-layout {
    padding: 30px 18px 90px;
  }

  .playlist-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 20px 13px;
  }

  .cover-art {
    width: 65px;
    height: 65px;
    font-size: 31px;
  }

  .page-heading {
    align-items: flex-start;
  }

  .create-button {
    padding: 11px 12px;
  }

  .detail-hero {
    flex-direction: column;
    align-items: flex-start;
    padding: 18px;
    gap: 20px;
  }

  .detail-cover {
    width: 100%;
    max-width: 240px;
    align-self: center;
  }

  .create-modal {
    padding: 25px 21px;
  }
}
</style>
