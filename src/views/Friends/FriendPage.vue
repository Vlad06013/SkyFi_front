<template>
    <ion-page>
        <AppNavigation />

        <ion-content :fullscreen="true" class="friend-content">
            <main class="friend-layout">
                <header class="friend-header">
                    <button
                        type="button"
                        class="back-button"
                        @click="goBack"
                    >
                        <ion-icon :icon="arrowBackOutline" />
                        К друзьям
                    </button>
                </header>

                <div v-if="profileError" class="friend-error">
                    {{ profileError }}
                </div>

                <!-- =====================================
                     КАРТОЧКА ДРУГА: АВАТАР, ИМЯ, ИГРАЕТ СЕЙЧАС
                ====================================== -->
                <section class="friend-card">
                    <div class="friend-card__avatar">
                        <img
                            v-if="profile?.avatar"
                            :src="profile.avatar"
                            :alt="profile.name"
                        >

                        <template v-else>
                            {{ getInitial(profile?.name) }}
                        </template>
                    </div>

                    <div class="friend-card__info">
                        <h2>{{ profile?.name ?? 'Загружаем...' }}</h2>

                        <p>{{ profile?.email ?? '' }}</p>
                    </div>

                    <div class="friend-card__now-playing">
                        <div v-if="isLoadingNowPlaying" class="section-hint">
                            Загружаем...
                        </div>

                        <div v-else-if="nowPlayingError" class="section-hint">
                            {{ nowPlayingError }}
                        </div>

                        <div
                            v-else-if="nowPlaying?.is_playing && nowPlaying.track"
                            class="now-playing now-playing--clickable"
                            @click="handleNowPlayingClick"
                        >
                            <div class="now-playing__icon">
                                <ion-icon
                                    :icon="
                                        isCurrentTrack(nowPlaying.track)
                                            ? player.isPlaying
                                                ? pauseOutline
                                                : playOutline
                                            : playOutline
                                    "
                                />
                            </div>

                            <div class="now-playing__info">
                                <div class="now-playing__title">
                                    {{ nowPlaying.track.title }}
                                </div>

                                <div
                                    v-if="trackArtists(nowPlaying.track)"
                                    class="now-playing__artists"
                                >
                                    {{ trackArtists(nowPlaying.track) }}
                                </div>

                                <div class="now-playing__hint">
                                    слушает сейчас · нажми, чтобы включить у себя
                                </div>
                            </div>
                        </div>

                        <div v-else class="section-empty">
                            Сейчас ничего не слушает.
                        </div>
                    </div>
                </section>

                <div class="friend-columns">
                <!-- =====================================
                     ОЧЕРЕДЬ ДРУГА
                ====================================== -->
                <section class="friend-section friend-columns__column">
                    <div class="section-heading">
                        <h2>Очередь друга</h2>
                    </div>

                    <div v-if="isLoadingFriendQueue" class="section-hint">
                        Загружаем...
                    </div>

                    <div v-else-if="friendQueueError" class="section-hint">
                        {{ friendQueueError }}
                    </div>

                    <template v-else>
                        <p
                            v-if="!friendQueue.length && !isQueueAddOpen"
                            class="section-empty"
                        >
                            Очередь пуста.
                        </p>

                        <ul v-if="friendQueue.length" class="track-list">
                            <li
                                v-for="(item, index) in friendQueue"
                                :key="item.id"
                                class="track-row"
                            >
                                <span class="track-row__index">
                                    {{ index + 1 }}
                                </span>

                                <img
                                    v-if="trackCover(item.track)"
                                    :src="trackCover(item.track) || undefined"
                                    class="track-row__cover"
                                    alt=""
                                >

                                <div
                                    v-else
                                    class="track-row__cover track-row__cover--placeholder"
                                >
                                    <ion-icon :icon="musicalNotesOutline" />
                                </div>

                                <div class="track-row__info">
                                    <div class="track-row__title">
                                        {{ item.track.title }}
                                    </div>

                                    <div
                                        v-if="trackArtists(item.track)"
                                        class="track-row__artists"
                                    >
                                        {{ trackArtists(item.track) }}
                                    </div>
                                </div>

                                <div
                                    v-if="formatDuration(item.track.duration)"
                                    class="track-row__duration"
                                >
                                    {{ formatDuration(item.track.duration) }}
                                </div>

                                <div class="track-row__actions track-row__actions--reorder">
                                    <button
                                        type="button"
                                        class="reorder-button"
                                        :disabled="isReorderPending || index === 0"
                                        aria-label="Выше"
                                        @click="handleMove(item, -1)"
                                    >
                                        <ion-icon :icon="chevronUpOutline" />
                                    </button>

                                    <button
                                        type="button"
                                        class="reorder-button"
                                        :disabled="isReorderPending || index === friendQueue.length - 1"
                                        aria-label="Ниже"
                                        @click="handleMove(item, 1)"
                                    >
                                        <ion-icon :icon="chevronDownOutline" />
                                    </button>
                                </div>
                            </li>
                        </ul>

                        <!-- Добавление прямо в список очереди -->
                        <div class="queue-add">
                            <button
                                v-if="!isQueueAddOpen"
                                type="button"
                                class="queue-add__toggle"
                                @click="openQueueAdd"
                            >
                                <ion-icon :icon="addOutline" />
                                Добавить трек в очередь
                            </button>

                            <template v-else>
                                <div class="friend-search">
                                    <ion-icon :icon="searchOutline" class="friend-search__icon" />

                                    <input
                                        ref="queueSearchInput"
                                        v-model="queueQuery"
                                        type="text"
                                        class="friend-search__input"
                                        placeholder="Найти трек по названию или исполнителю"
                                        autocomplete="off"
                                    >

                                    <button
                                        type="button"
                                        class="queue-add__close"
                                        aria-label="Закрыть поиск"
                                        @click="closeQueueAdd"
                                    >
                                        <ion-icon :icon="closeOutline" />
                                    </button>
                                </div>

                                <div v-if="isQueueSearching" class="section-hint">
                                    Ищем...
                                </div>

                                <ul v-else-if="queueResults.length" class="track-list">
                                    <li
                                        v-for="track in queueResults"
                                        :key="String(track.id)"
                                        class="track-row track-row--clickable"
                                        @click="handleTrackClick(track)"
                                    >
                                        <img
                                            v-if="trackCover(track)"
                                            :src="trackCover(track) || undefined"
                                            class="track-row__cover"
                                            alt=""
                                        >

                                        <div
                                            v-else
                                            class="track-row__cover track-row__cover--placeholder"
                                        >
                                            <ion-icon
                                                :icon="
                                                    isCurrentTrack(track)
                                                        ? player.isPlaying
                                                            ? pauseOutline
                                                            : playOutline
                                                        : musicalNotesOutline
                                                "
                                            />
                                        </div>

                                        <div class="track-row__info">
                                            <div class="track-row__title">
                                                {{ track.title }}
                                            </div>

                                            <div
                                                v-if="trackArtists(track)"
                                                class="track-row__artists"
                                            >
                                                {{ trackArtists(track) }}
                                            </div>
                                        </div>

                                        <div
                                            v-if="formatDuration(track.duration)"
                                            class="track-row__duration"
                                        >
                                            {{ formatDuration(track.duration) }}
                                        </div>

                                        <div class="track-row__actions">
                                            <button
                                                v-if="isTrackInFriendQueue(track)"
                                                type="button"
                                                class="action-button action-button--muted"
                                                disabled
                                            >
                                                <ion-icon :icon="checkmarkOutline" />
                                                В очереди
                                            </button>

                                            <button
                                                v-else
                                                type="button"
                                                class="action-button action-button--primary"
                                                :disabled="queuePending[String(track.id)]"
                                                @click.stop="handleAddToQueue(track)"
                                            >
                                                <ion-icon :icon="addOutline" />
                                                {{
                                                    queuePending[String(track.id)]
                                                        ? 'Добавляем...'
                                                        : 'В очередь'
                                                }}
                                            </button>
                                        </div>
                                    </li>
                                </ul>

                                <div
                                    v-else-if="queueQuery.trim().length >= 2"
                                    class="section-hint"
                                >
                                    Ничего не нашли. Попробуй другой запрос.
                                </div>
                            </template>
                        </div>
                    </template>

                    <div v-if="queueError" class="friend-error">
                        {{ queueError }}
                    </div>
                </section>

                <!-- =====================================
                     ИЗБРАННОЕ ДРУГА
                ====================================== -->
                <section class="friend-section friend-columns__column">
                    <div class="section-heading">
                        <h2>Избранное друга</h2>
                    </div>

                    <div v-if="isLoadingFavorites" class="section-hint">
                        Загружаем...
                    </div>

                    <div v-else-if="favoritesError" class="section-hint">
                        {{ favoritesError }}
                    </div>

                    <ul v-else-if="favorites.length" class="track-list">
                        <li
                            v-for="track in favorites"
                            :key="String(track.id)"
                            class="track-row"
                        >
                            <img
                                v-if="trackCover(track)"
                                :src="trackCover(track) || undefined"
                                class="track-row__cover"
                                alt=""
                            >

                            <div
                                v-else
                                class="track-row__cover track-row__cover--placeholder"
                            >
                                <ion-icon :icon="musicalNotesOutline" />
                            </div>

                            <div class="track-row__info">
                                <div class="track-row__title">
                                    {{ track.title }}
                                </div>

                                <div
                                    v-if="trackArtists(track)"
                                    class="track-row__artists"
                                >
                                    {{ trackArtists(track) }}
                                </div>
                            </div>

                            <div
                                v-if="formatDuration(track.duration)"
                                class="track-row__duration"
                            >
                                {{ formatDuration(track.duration) }}
                            </div>
                        </li>
                    </ul>

                    <div v-else class="section-empty">
                        В избранном пока пусто.
                    </div>
                </section>
                </div>
            </main>
        </ion-content>
    </ion-page>
</template>

<script src="./FriendPage.ts" lang="ts"></script>

<style src="./FriendPage.css" scoped></style>
