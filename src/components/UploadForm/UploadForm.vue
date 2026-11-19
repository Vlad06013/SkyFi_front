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
    <label>Видимость</label>
    <div class="select" :class="{ 'is-open': visibilityOpen }">
      <button type="button" class="select-box" @click="visibilityOpen = !visibilityOpen">
        <span class="val">{{ visibilityLabel }}</span>
        <svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <path d="m6 9.5 6 6 6-6" />
        </svg>
      </button>
      <div v-if="visibilityOpen" class="select-menu">
        <button
          v-for="option in visibilityOptions"
          :key="option.value"
          type="button"
          class="select-opt"
          :class="{ 'is-on': visibility === option.value }"
          @click="pickVisibility(option.value)"
        >
          <span>{{ option.label }}<span class="osub">{{ option.hint }}</span></span>
          <svg
            v-if="visibility === option.value"
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
    </div>
    <button class="btn btn-primary" type="submit" style="width:100%;justify-content:center">
      {{ submitLabel }}
    </button>
  </form>
</template>

<script src="./UploadForm.ts" lang="ts"></script>
