<template>
  <nav class="tabbar">
    <router-link
      v-for="item in tabs"
      :key="item.to"
      class="tab"
      :class="{ on: isOn(item.to) }"
      :to="item.to"
    >
      <i v-if="item.badge" class="badge-dot" />
      <svg v-if="item.id === 'home'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z" />
      </svg>
      <svg v-else-if="item.id === 'search'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
        <circle cx="11" cy="11" r="7" />
        <path d="M16.5 16.5 21 21" />
      </svg>
      <svg v-else-if="item.id === 'library'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="8.4" />
        <path d="M12 15.4s-3.4-2-4.4-4.3c-.6-1.4.3-2.9 1.8-2.9 1 0 2.6 1 2.6 1s1.6-1 2.6-1c1.5 0 2.4 1.5 1.8 2.9-1 2.3-4.4 4.3-4.4 4.3z" fill="currentColor" stroke="none" />
      </svg>
      <svg v-else-if="item.id === 'friends'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
        <circle cx="9" cy="8" r="3.5" />
        <path d="M3.5 19c.7-3 2.9-4.5 5.5-4.5s4.8 1.5 5.5 4.5" />
      </svg>
      <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="3.2" />
        <path d="M12 2.8v2.7M12 18.5v2.7M21.2 12h-2.7M5.5 12H2.8M18.7 5.3l-1.9 1.9M7.2 16.8l-1.9 1.9M18.7 18.7l-1.9-1.9M7.2 7.2 5.3 5.3" />
      </svg>
      {{ item.label }}
    </router-link>
  </nav>
</template>

<script src="./TabBar.ts" lang="ts"></script>
