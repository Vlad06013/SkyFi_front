<template>
  <span class="src" :title="label">
    <svg v-if="source === 'yandex_music' || source === 'mock'" viewBox="0 0 24 24" fill="currentColor">
      <circle cx="11" cy="13.6" r="8.4" fill="none" stroke="currentColor" stroke-width="1.8" />
      <circle cx="9.6" cy="14.8" r="3.7" />
      <path d="M12.7 5.6h2.05v9.4H12.7z" />
      <path d="M14.75 5.6h6.3l-1.7 3.7h-6.3z" />
    </svg>
    <svg v-else-if="source === 'vk'" viewBox="8 14 33 21" fill="currentColor">
      <path d="M25.54 34.58C14.6 34.58 8.36 27.08 8.1 14.6h5.48c.18 9.16 4.22 13.04 7.42 13.84V14.6h5.16v7.9c3.16-.34 6.48-3.94 7.6-7.9h5.16c-.86 4.88-4.46 8.48-7.02 9.96 2.56 1.2 6.66 4.34 8.22 10.02h-5.68c-1.22-3.8-4.26-6.74-8.28-7.14v7.14h-.62z" />
    </svg>
    <svg v-else-if="source === 'dzen' || source === 'zen'" viewBox="0 0 24 24" fill="currentColor">
      <path
        fill-rule="evenodd"
        d="M12 1.8a10.2 10.2 0 1 0 7.4 17.2 1.7 1.7 0 0 0-2.4-2.4 6.8 6.8 0 1 1 2.1-5.1 1.7 1.7 0 1 0 3.3.7A10.2 10.2 0 0 0 12 1.8z"
      />
    </svg>
    <svg v-else-if="source === 'youtube'" viewBox="0 0 24 24" fill="currentColor">
      <path
        fill-rule="evenodd"
        d="M3.2 7.2h17.6a2.2 2.2 0 0 1 2.2 2.2v5.2a2.2 2.2 0 0 1-2.2 2.2H3.2A2.2 2.2 0 0 1 1 14.6V9.4a2.2 2.2 0 0 1 2.2-2.2zm6.5 1.7 5.6 3.1-5.6 3.1V8.9z"
      />
    </svg>
    <svg v-else-if="source === 'upload'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M12 15.5V5" />
      <path d="M8.2 8.8 12 5l3.8 3.8" />
      <path d="M5 19h14" />
    </svg>
    <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M4.2 10.6a8.4 8.4 0 0 1 15.6 0" stroke-linecap="butt" />
      <path d="M9 12.4v8.1l7.7-4.05z" fill="currentColor" stroke="none" />
    </svg>
  </span>
</template>

<script src="./SourceBadge.ts" lang="ts"></script>
