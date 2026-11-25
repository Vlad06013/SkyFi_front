<template>
  <AppSheet :open="Boolean(sheet)" :title="title" @close="close">
    <div v-if="sheet !== 'devices'" class="now-card" style="margin-bottom:8px">
      <div class="thumb" :style="{ background: coverVar(entity.source) }">
        <img v-if="coverImage" :src="coverImage" alt="">
        <SourceBadge :source="entity.source" />
      </div>
      <div class="track-meta">
        <div class="track-title">{{ entity.title }}</div>
        <div class="track-artist">{{ entity.artist }}</div>
      </div>
    </div>

        <template v-if="sheet === 'friend-queue' || sheet === 'friend-share'">
          <div class="field" :class="{ 'is-focus': friendFocus }" style="margin-bottom:10px">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
              <circle cx="11" cy="11" r="7" /><path d="M16.5 16.5 21 21" />
            </svg>
            <input
              v-model="friendQuery"
              placeholder="email"
              @focus="friendFocus = true"
              @blur="friendFocus = false"
            >
          </div>
          <button
            v-for="friend in visibleFriends"
            :key="friend.user.id"
            class="friend-row"
            type="button"
            @click="sheet === 'friend-share' ? pickShare(friend) : pickQueue(friend)"
          >
            <div class="avatar ini" :class="friendTone(friend.user.id)">
              <img v-if="friend.user.avatar_url" :src="friend.user.avatar_url" alt="">
              <template v-else>{{ friendInitial(friend.user.name) }}</template>
            </div>
            <div class="track-meta">
              <div class="track-title">{{ friend.user.name }}</div>
              <div v-if="friend.live" class="idle">{{ friend.live }}</div>
            </div>
            <svg
              v-if="sheet === 'friend-queue'"
              class="friend-act"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.8"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <path d="M3 6h11M3 12h11M3 18h6.5" />
              <path d="M13.6 7 22 12l-8.4 5z" fill="currentColor" stroke="none" />
            </svg>
            <svg
              v-else
              class="friend-act"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.8"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <path d="M8 9.5H6.5A2.5 2.5 0 0 0 4 12v7.5A2.5 2.5 0 0 0 6.5 22h11a2.5 2.5 0 0 0 2.5-2.5V12a2.5 2.5 0 0 0-2.5-2.5H16" />
              <path d="M12 15.5V3m0 0 3.6 3.6M12 3 8.4 6.6" />
            </svg>
          </button>
        </template>

        <template v-else-if="sheet === 'playlist'">
          <div v-if="!favoritePlaylists.length" class="empty">плейлистов нет</div>
          <SnapshotRow
            v-for="playlist in favoritePlaylists"
            :key="playlist.source_id"
            kind="media"
            :title="playlist.title"
            :subtitle="`${playlist.item_count} треков`"
            entity-type="playlist"
            :source="playlist.source_type"
            :source-id="playlist.source_id"
            :cover="playlist.cover_url ?? ''"
            :menuable="false"
            @open="pickPlaylist(playlist.title)"
          />
        </template>

        <template v-else-if="sheet === 'share'">
          <div v-if="shareLoading" class="copied">
            <svg class="spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
              <circle cx="12" cy="12" r="8" opacity=".25" />
              <path d="M12 4a8 8 0 0 1 8 8" stroke-linecap="round" />
            </svg>
            получаем ссылку…
          </div>
          <div v-else-if="shareUrl" class="copied">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5 9.5 17 19 7.5" /></svg>
            Ссылка уже в буфере
          </div>
          <div v-else class="copied">не удалось получить ссылку</div>
          <button class="friend-row" type="button" style="padding:8px 4px" @click="openInAppShare">
            <div class="avatar ini" style="background:linear-gradient(135deg,#3ee87f,#0a3d24)">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M4.2 10.6a8.4 8.4 0 0 1 15.6 0" stroke-linecap="butt" />
                <path d="M9 12.4v8.1l7.7-4.05z" fill="currentColor" stroke="none" />
              </svg>
            </div>
            <div class="track-meta">
              <div class="track-title">Другу в SkyFi</div>
            </div>
          </button>
          <button class="friend-row" type="button" style="padding:8px 4px" @click="shareExternally">
            <div class="avatar ini" style="background:var(--color-surface-3)">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                <path d="M8 9.5H6.5A2.5 2.5 0 0 0 4 12v7.5A2.5 2.5 0 0 0 6.5 22h11a2.5 2.5 0 0 0 2.5-2.5V12a2.5 2.5 0 0 0-2.5-2.5H16" />
                <path d="M12 15.5V3m0 0 3.6 3.6M12 3 8.4 6.6" />
              </svg>
            </div>
            <div class="track-meta">
              <div class="track-title">Через приложение</div>
              <div class="idle">выбор, куда отправить</div>
            </div>
          </button>
        </template>

        <template v-else-if="sheet === 'devices'">
          <div v-if="!deviceLoaded" class="idle" style="padding:12px 4px">загружаем устройства…</div>
          <div v-else-if="!deviceList.length" class="idle" style="padding:12px 4px">Нет устройств в сети</div>
          <div v-else class="select-menu">
            <button
              v-for="device in deviceList"
              :key="device.device_uuid"
              class="select-opt"
              :class="{ 'is-on': device.device_uuid === activeDeviceUuid }"
              type="button"
              @click="pickDevice(device.device_uuid)"
            >
              <span>
                {{ device.name }}
                <span v-if="deviceCaption(device)" class="osub">{{ deviceCaption(device) }}</span>
              </span>
              <svg
                v-if="device.device_uuid === activeDeviceUuid"
                class="tick"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2.2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <path d="M5 12.5 9.5 17 19 7.5" />
              </svg>
            </button>
          </div>
        </template>
  </AppSheet>
</template>

<script src="./MediaActionSheet.ts" lang="ts"></script>

<style scoped src="./MediaActionSheet.css"></style>
