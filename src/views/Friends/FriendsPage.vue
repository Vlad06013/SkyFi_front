<template>
    <ion-page>
        <AppNavigation />

        <ion-content :fullscreen="true" class="friends-content">
            <ProfileMenu floating />

            <main class="friends-layout">
                <header class="friends-header">
                    <div class="eyebrow">
                        СООБЩЕСТВО
                    </div>

                    <h1>Друзья</h1>

                    <p class="subtitle">
                        Находи друзей по имени или email и управляй заявками
                    </p>
                </header>

                <!-- =====================================
                     ПОИСК ПОЛЬЗОВАТЕЛЕЙ
                ====================================== -->
                <section class="friends-section">
                    <div class="section-heading">
                        <h2>Добавить друга</h2>
                    </div>

                    <div class="friend-search">
                        <ion-icon :icon="searchOutline" class="friend-search__icon" />

                        <input
                            v-model="searchQuery"
                            type="text"
                            class="friend-search__input"
                            placeholder="Имя или email пользователя"
                            autocomplete="off"
                        >
                    </div>

                    <div v-if="isSearching" class="section-hint">
                        Ищем...
                    </div>

                    <ul v-else-if="searchResults.length" class="friends-list">
                        <li
                            v-for="result in searchResults"
                            :key="result.id"
                            class="friend-row"
                        >
                            <div class="friend-avatar">
                                {{ getInitial(result.name) }}
                            </div>

                            <div class="friend-info">
                                <div class="friend-name">
                                    {{ result.name }}
                                </div>
                            </div>

                            <div class="friend-actions">
                                <button
                                    v-if="isFriend(result)"
                                    type="button"
                                    class="action-button action-button--muted"
                                    disabled
                                >
                                    Уже друзья
                                </button>

                                <button
                                    v-else-if="isIncoming(result)"
                                    type="button"
                                    class="action-button action-button--primary"
                                    :disabled="isPending('search-' + result.id)"
                                    @click="handleAcceptFromSearch(result)"
                                >
                                    <ion-icon :icon="checkmarkOutline" />
                                    Принять заявку
                                </button>

                                <button
                                    v-else-if="isOutgoing(result)"
                                    type="button"
                                    class="action-button"
                                    :disabled="isPending('search-' + result.id)"
                                    @click="handleCancelFromSearch(result)"
                                >
                                    Отменить заявку
                                </button>

                                <button
                                    v-else
                                    type="button"
                                    class="action-button action-button--primary"
                                    :disabled="isPending('search-' + result.id)"
                                    @click="handleAdd(result)"
                                >
                                    <ion-icon :icon="personAddOutline" />
                                    {{
                                        isPending('search-' + result.id)
                                            ? 'Отправляем...'
                                            : 'Добавить'
                                    }}
                                </button>
                            </div>
                        </li>
                    </ul>

                    <div
                        v-else-if="searchQuery.trim().length >= 2"
                        class="section-hint"
                    >
                        Никого не нашли. Попробуй другой запрос.
                    </div>
                </section>

                <div v-if="actionError" class="friends-error">
                    {{ actionError }}
                </div>

                <!-- =====================================
                     ВХОДЯЩИЕ ЗАЯВКИ
                ====================================== -->
                <section class="friends-section">
                    <div class="section-heading">
                        <h2>Входящие заявки</h2>

                        <span
                            v-if="friendsStore.incomingCount"
                            class="count-badge"
                        >
                            {{ friendsStore.incomingCount }}
                        </span>
                    </div>

                    <ul v-if="friendsStore.incomingRequests.length" class="friends-list">
                        <li
                            v-for="request in friendsStore.incomingRequests"
                            :key="request.id"
                            class="friend-row"
                        >
                            <div class="friend-avatar">
                                {{ getInitial(counterpart(request).name) }}
                            </div>

                            <div class="friend-info">
                                <div class="friend-name">
                                    {{ counterpart(request).name }}
                                </div>

                                <div class="friend-sub">
                                    хочет добавить тебя в друзья
                                </div>
                            </div>

                            <div class="friend-actions">
                                <button
                                    type="button"
                                    class="action-button action-button--primary"
                                    :disabled="isPending('row-' + request.id)"
                                    @click="handleAccept(request.id)"
                                >
                                    <ion-icon :icon="checkmarkOutline" />
                                    Принять
                                </button>

                                <button
                                    type="button"
                                    class="action-button"
                                    :disabled="isPending('row-' + request.id)"
                                    @click="handleReject(request.id)"
                                >
                                    <ion-icon :icon="closeOutline" />
                                    Отклонить
                                </button>
                            </div>
                        </li>
                    </ul>

                    <div v-else class="section-empty">
                        Новых заявок нет. О приходе заявки сообщим прямо здесь.
                    </div>
                </section>

                <!-- =====================================
                     ИСХОДЯЩИЕ ЗАЯВКИ
                ====================================== -->
                <section v-if="friendsStore.outgoingRequests.length" class="friends-section">
                    <div class="section-heading">
                        <h2>Отправленные заявки</h2>
                    </div>

                    <ul class="friends-list">
                        <li
                            v-for="request in friendsStore.outgoingRequests"
                            :key="request.id"
                            class="friend-row"
                        >
                            <div class="friend-avatar">
                                {{ getInitial(counterpart(request).name) }}
                            </div>

                            <div class="friend-info">
                                <div class="friend-name">
                                    {{ counterpart(request).name }}
                                </div>

                                <div class="friend-sub">
                                    заявка отправлена
                                </div>
                            </div>

                            <div class="friend-actions">
                                <button
                                    type="button"
                                    class="action-button"
                                    :disabled="isPending('row-' + request.id)"
                                    @click="handleCancel(request.id)"
                                >
                                    <ion-icon :icon="closeOutline" />
                                    Отменить
                                </button>
                            </div>
                        </li>
                    </ul>
                </section>

                <!-- =====================================
                     ПОДЕЛИЛИСЬ СО МНОЙ
                ====================================== -->
                <section
                    v-if="friendsStore.trackShares.length"
                    class="friends-section"
                >
                    <div class="section-heading">
                        <h2>Поделились со мной</h2>

                        <span class="count-badge">
                            {{ friendsStore.trackShares.length }}
                        </span>
                    </div>

                    <ul class="friends-list">
                        <li
                            v-for="share in friendsStore.trackShares"
                            :key="share.id"
                            class="friend-row friend-row--clickable"
                            @click="playSharedTrack(share)"
                        >
                            <div class="friend-avatar">♫</div>

                            <div class="friend-info">
                                <div class="friend-name">
                                    {{ share.track.title }}
                                </div>

                                <div class="friend-sub">
                                    {{
                                        share.track.meta?.artists
                                            ?.map(artist => artist.name)
                                            .join(', ')
                                        || 'Неизвестный исполнитель'
                                    }}
                                    · от {{ share.sender.name }}
                                </div>
                            </div>

                            <div class="friend-actions">
                                <button
                                    type="button"
                                    class="action-button action-button--primary"
                                    @click.stop="playSharedTrack(share)"
                                >
                                    <ion-icon :icon="playOutline" />
                                    Слушать
                                </button>

                                <button
                                    type="button"
                                    class="action-button"
                                    @click.stop="friendsStore.removeTrackShare(share.id)"
                                >
                                    <ion-icon :icon="trashOutline" />
                                    Убрать
                                </button>
                            </div>
                        </li>
                    </ul>
                </section>

                <!-- =====================================
                     ДРУЗЬЯ
                ====================================== -->
                <section class="friends-section">
                    <div class="section-heading">
                        <h2>Мои друзья</h2>
                    </div>

                    <ul v-if="friendsStore.friends.length" class="friends-list">
                        <li
                            v-for="friendship in friendsStore.friends"
                            :key="friendship.id"
                            class="friend-row friend-row--clickable"
                            @click="openFriend(friendship)"
                        >
                            <div class="friend-avatar">
                                {{ getInitial(counterpart(friendship).name) }}
                            </div>

                            <div class="friend-info">
                                <div class="friend-name">
                                    {{ counterpart(friendship).name }}
                                </div>

                                <div class="friend-sub">
                                    открыть профиль
                                </div>
                            </div>

                            <div class="friend-actions">
                                <ion-icon
                                    :icon="chevronForwardOutline"
                                    class="friend-row__chevron"
                                />

                                <button
                                    type="button"
                                    class="action-button action-button--danger"
                                    :disabled="isPending('row-' + friendship.id)"
                                    @click.stop="handleRemove(friendship.id)"
                                >
                                    <ion-icon :icon="trashOutline" />
                                    Удалить
                                </button>
                            </div>
                        </li>
                    </ul>

                    <div v-else class="section-empty">
                        Пока нет друзей. Найди кого-нибудь через поиск выше.
                    </div>
                </section>

                <div v-if="friendsStore.isLoading" class="section-hint">
                    Загрузка...
                </div>
            </main>
        </ion-content>
    </ion-page>
</template>

<script src="./FriendsPage.ts" lang="ts"></script>

<style src="./FriendsPage.css" scoped></style>
