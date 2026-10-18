```vue
<template>
  <nav class="app-navigation">
    <RouterLink to="/home" class="nav-logo">
      <span class="logo-icon">S</span>
      <span class="logo-text">SkyFi</span>
    </RouterLink>

    <div class="nav-links">
      <RouterLink to="/home" class="nav-link">
        <span class="nav-icon">⌂</span>
        <span class="nav-label">Главная</span>
      </RouterLink>

      <RouterLink to="/search" class="nav-link">
        <span class="nav-icon">⌕</span>
        <span class="nav-label">Поиск</span>
      </RouterLink>

      <RouterLink to="/library" class="nav-link">
        <span class="nav-icon">♫</span>
        <span class="nav-label">Моя библиотека</span>
      </RouterLink>

      <RouterLink to="/playlists" class="nav-link">
        <span class="nav-icon">▤</span>
        <span class="nav-label">Плейлисты</span>
      </RouterLink>
    </div>
  </nav>
</template>

<script setup lang="ts">
import { RouterLink } from 'vue-router';
</script>

<style scoped>
.app-navigation {
  position: fixed;
  top: 0;
  left: 0;
  bottom: 0;
  z-index: 1000;
  width: 236px;
  padding: 30px 18px;
  background: #0b0d12;
  border-right: 1px solid #292d3b;
  display: flex;
  flex-direction: column;
  gap: 42px;
  box-sizing: border-box;
}

.nav-logo {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 0 12px;
  color: #f5f7fa;
  text-decoration: none;
}

.logo-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 38px;
  height: 38px;
  border-radius: 12px;
  background: #8b5cf6;
  color: white;
  font-size: 23px;
  font-weight: 800;
}

.logo-text {
  font-size: 24px;
  font-weight: 750;
  letter-spacing: -0.8px;
}

.nav-links {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.nav-link {
  display: flex;
  align-items: center;
  gap: 15px;
  padding: 13px 14px;
  border-radius: 12px;
  color: #9296a7;
  text-decoration: none;
  font-size: 14px;
  font-weight: 500;
  transition: background 0.2s, color 0.2s;
}

.nav-link:hover {
  color: #f5f7fa;
  background: #171a23;
}

.nav-link.router-link-active {
  color: #c4b5fd;
  background: rgba(139, 92, 246, 0.15);
}

.nav-icon {
  width: 24px;
  text-align: center;
  font-size: 25px;
  line-height: 1;
}

@media (max-width: 700px) {
  .app-navigation {
    top: auto;
    right: 0;
    bottom: 0;
    width: 100%;
    height: 72px;
    padding: 6px 8px;
    border-right: none;
    border-top: 1px solid #292d3b;
    flex-direction: row;
    justify-content: center;
    gap: 0;
  }

  .nav-logo {
    display: none;
  }

  .nav-links {
    width: 100%;
    flex-direction: row;
    justify-content: space-around;
    gap: 4px;
  }

  .nav-link {
    flex: 1;
    min-width: 0;
    flex-direction: column;
    justify-content: center;
    gap: 4px;
    padding: 5px 2px;
    font-size: 10px;
    border-radius: 9px;
  }

  .nav-icon {
    font-size: 22px;
  }

  .nav-label {
    white-space: nowrap;
  }
}
</style>
```