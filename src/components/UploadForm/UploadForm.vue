<template>
  <form class="up-form" @submit.prevent="submit">
    <div class="drop" role="button" tabindex="0" @click="pickFile">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12 15.5V5" />
        <path d="M8.2 8.8 12 5l3.8 3.8" />
        <path d="M5 19h14" />
      </svg>
      <div class="name">Выбери файл</div>
      <div class="meta">mp3, flac, wav, m4a</div>
    </div>
    <label>Название</label>
    <div class="field" :class="{ 'is-focus': titleFocus }">
      <input
        v-model="title"
        placeholder="как называется"
        @focus="titleFocus = true"
        @blur="titleFocus = false"
      >
    </div>
    <label>Исполнители</label>
    <div class="field" :class="{ 'is-focus': artistFocus }">
      <input
        v-model="artists"
        placeholder="имя или группа"
        @focus="artistFocus = true"
        @blur="artistFocus = false"
      >
    </div>
    <label>Альбом</label>
    <div class="field" :class="{ 'is-focus': albumFocus }">
      <input
        v-model="album"
        placeholder="необязательно"
        @focus="albumFocus = true"
        @blur="albumFocus = false"
      >
    </div>
    <button class="btn btn-primary" type="submit" style="width:100%;justify-content:center">
      Загрузить
    </button>
  </form>
</template>

<script src="./UploadForm.ts" lang="ts"></script>
