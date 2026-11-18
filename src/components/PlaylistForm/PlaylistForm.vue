<template>
  <form class="up-form" @submit.prevent="submit">
    <div class="pic-plus" role="button" tabindex="0" aria-label="обложка" @click="pickCover" @keydown.enter.prevent="pickCover">
      <div class="pic" :style="coverStyle" />
      <span class="plus" aria-label="загрузить обложку">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round">
          <path d="M12 5v14M5 12h14" />
        </svg>
      </span>
    </div>
    <input ref="fileInput" type="file" accept="image/*" hidden @change="onCoverPicked">
    <label>Название</label>
    <div class="field" :class="{ 'is-focus': nameFocus }">
      <input
        v-model="name"
        placeholder="Например: В дорогу"
        @focus="nameFocus = true"
        @blur="nameFocus = false"
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
    <button class="btn btn-primary" type="submit" style="width:100%;justify-content:center;margin-top:4px">
      {{ submitLabel }}
    </button>
  </form>
</template>

<script src="./PlaylistForm.ts" lang="ts"></script>
