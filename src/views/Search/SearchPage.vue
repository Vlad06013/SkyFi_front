<template>
  <ion-page>
    <AppNavigation />

    <ion-content :fullscreen="true" class="skyfi-content">
      <ProfileMenu floating />

      <div class="search-layout">
        <header class="search-header">
          <div>
            <div class="eyebrow">ОТКРЫВАЙ НОВОЕ</div>
            <h1>Поиск</h1>
            <p class="subtitle">Найди музыку под своё настроение</p>
          </div>
        </header>

        <!-- Строка поиска -->
        <div class="search-box">
          <ion-icon :icon="searchOutline" />

          <input
              v-model="query"
              type="search"
              placeholder="Треки, исполнители, альбомы..."
              aria-label="Поиск музыки"
          />

          <button
              v-if="query"
              class="clear-button"
              type="button"
              aria-label="Очистить поиск"
              @click="query = ''"
          >
            <ion-icon :icon="closeOutline" />
          </button>
        </div>

        <!-- Источники музыки -->
        <div class="source-filters">
          <button
              v-for="source in sourceFilters"
              :key="source.value"
              class="source-filter"
              :class="{ active: activeSource === source.value }"
              type="button"
              @click="activeSource = source.value"
          >
            {{ source.label }}
          </button>
        </div>

        <!-- Фильтры -->
        <div class="filters">
          <button
              v-for="filter in filters"
              :key="filter.value"
              class="filter"
              :class="{ active: activeFilter === filter.value }"
              type="button"
              @click="activeFilter = filter.value"
          >
            {{ filter.label }}
          </button>
        </div>

        <!-- Обзор до начала поиска -->
        <section v-if="!query.trim()" class="discovery">
          <h2>Популярные запросы</h2>

          <div class="chips">
            <button
                v-for="term in popularSearches"
                :key="term"
                class="chip"
                type="button"
                @click="query = term"
            >
              <ion-icon :icon="trendingUpOutline" />
              {{ term }}
            </button>
          </div>

          <h2 class="section-heading">Популярные жанры</h2>

          <div class="genre-grid">
            <button
                v-for="genre in genres"
                :key="genre.name"
                class="genre-card"
                :style="{ '--genre-color': genre.color }"
                type="button"
                @click="query = genre.name"
            >
              <span>{{ genre.name }}</span>
              <ion-icon :icon="musicalNotesOutline" />
            </button>
          </div>
        </section>

        <!-- Результаты поиска -->
        <section v-else class="results">
          <div class="results-heading">
            <h2>Результаты</h2>
            <span>
              {{ filteredTracks.length }}
              {{
                filteredTracks.length === 1
                    ? 'трек'
                    : 'треков'
              }}
            </span>
          </div>


          <!-- Список результатов поиска -->
          <SearchResultsList
              :items="filteredTracks"
              :loading="searchLoading"
              :error="searchError"
              :retry="retrySearch"
          />
        </section>

        <div class="demo-note">
          <ion-icon :icon="informationCircleOutline" />
          Результаты поиска музыки SkyFi.
        </div>
      </div>
    </ion-content>
    <AudioPlayer />
  </ion-page>
</template>

<script setup lang="ts">
import {
  IonContent,
  IonPage,
  IonIcon,
} from '@ionic/vue';
import { computed, ref } from 'vue';
import AppNavigation from '@/components/AppNavigation.vue';
import AudioPlayer from '@/components/player/AudioPlayer.vue';
import ProfileMenu from '@/components/profile/ProfileMenu.vue';
import SearchResultsList from '@/components/lists/SearchResultsList.vue';
import { useSearch } from './search';

// type SearchSource = 'all' | 'uploads' | 'yandex_music' | 'internet_archive';

// const activeSource = ref<SearchSource>('all');

// const sourceFilters: {
//   label: string;
//   value: SearchSource;
// }[] = [
//   { label: 'Все', value: 'all' },
//   { label: 'Загрузки', value: 'uploads' },
//   { label: 'Яндекс Музыка', value: 'yandex_music' },
//   { label: 'Internet Archive', value: 'internet_archive' },
// ];

const sourceFilteredTracks = computed(() => {
  if (activeSource.value === 'all') {
    return filteredTracks.value;
  }

  return filteredTracks.value.filter(
      track => track.source_type === activeSource.value,
  );
});

const {
  query,
  activeFilter,
  filters,
  activeSource,
  sourceFilters,
  popularSearches,
  genres,
  searchLoading,
  searchError,
  filteredTracks,
  retrySearch,
  searchOutline,
  closeOutline,
  trendingUpOutline,
  musicalNotesOutline,
  informationCircleOutline,
} = useSearch();
</script>

<style src="./search.css" scoped></style>