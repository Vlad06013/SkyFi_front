<template>
  <nav class="app-navigation">
    <!-- Логотип -->
    <RouterLink to="/home" class="nav-logo">
      <span class="logo-icon">S</span>
      <span class="logo-text">SkyFi</span>
    </RouterLink>

    <!-- Основное меню -->
    <div class="nav-links">
      <RouterLink
          to="/home"
          class="nav-link"
          exact-active-class="nav-link-exact-active"
      >
        <span class="nav-icon">
          <ion-icon :icon="homeOutline" />
        </span>

        <span class="nav-label">Главная</span>
      </RouterLink>

      <RouterLink to="/search" class="nav-link">
        <span class="nav-icon">
          <ion-icon :icon="searchOutline" />
        </span>

        <span class="nav-label">Поиск</span>
      </RouterLink>

      <RouterLink to="/library" class="nav-link">
        <span class="nav-icon">
          <ion-icon :icon="musicalNotesOutline" />
        </span>

        <span class="nav-label">Мое</span>
      </RouterLink>

      <RouterLink to="/playlists" class="nav-link">
        <span class="nav-icon">
          <ion-icon :icon="listOutline" />
        </span>

        <span class="nav-label">Плейлисты</span>
      </RouterLink>
    </div>
  </nav>
</template>

<script setup lang="ts">
import { RouterLink } from 'vue-router';

import { IonIcon } from '@ionic/vue';

import {
  homeOutline,
  searchOutline,
  musicalNotesOutline,
  listOutline,
} from 'ionicons/icons';
</script>

<style scoped>
/* =========================================
   ОСНОВНАЯ НАВИГАЦИЯ
========================================= */

.app-navigation {
  position: fixed;
  top: 0;
  left: 0;
  bottom: 0;

  z-index: 1000;

  display: flex;
  flex-direction: column;

  width: 236px;
  box-sizing: border-box;

  padding: 30px 18px;
  gap: 42px;

  background: #0b0d12;
  border-right: 1px solid #292d3b;
}

/* =========================================
   ЛОГОТИП
========================================= */

.nav-logo {
  display: flex;
  align-items: center;

  flex-shrink: 0;

  gap: 12px;
  padding: 0 12px;

  color: #f5f7fa;
  text-decoration: none;
}

.logo-icon {
  display: flex;
  align-items: center;
  justify-content: center;

  flex-shrink: 0;

  width: 38px;
  height: 38px;

  box-sizing: border-box;

  border-radius: 12px;

  background: #8b5cf6;
  color: #ffffff;

  font-size: 23px;
  font-weight: 800;
  line-height: 1;
}

.logo-text {
  color: #f5f7fa;

  font-size: 24px;
  font-weight: 750;
  line-height: 1;

  letter-spacing: -0.8px;
}

/* =========================================
   СПИСОК ПУНКТОВ
========================================= */

.nav-links {
  display: flex;
  flex-direction: column;

  width: 100%;

  gap: 8px;
}

/* =========================================
   ПУНКТ МЕНЮ
========================================= */

.nav-link {
  display: flex;
  align-items: center;

  width: 100%;
  min-height: 46px;

  box-sizing: border-box;

  gap: 12px;
  padding: 10px 14px;

  border: none;
  border-radius: 12px;

  background: transparent;

  color: #9296a7;
  text-decoration: none;

  font-family: inherit;
  font-size: 14px;
  font-weight: 500;
  line-height: 20px;

  transition:
      background 0.2s ease,
      color 0.2s ease;
}

/* =========================================
   ИКОНКА
========================================= */

.nav-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;

  flex: 0 0 24px;

  width: 24px;
  height: 24px;

  margin: 0;
  padding: 0;

  box-sizing: border-box;

  font-size: 21px;
  line-height: 1;

  color: inherit;
}

/*
  Ionic Icon может иметь собственные размеры.
  Задаём их явно, чтобы все иконки занимали
  одинаковую область.
*/

.nav-icon ion-icon {
  display: block;

  width: 22px;
  height: 22px;

  margin: 0;
  padding: 0;

  flex-shrink: 0;
}

/* =========================================
   ТЕКСТ
========================================= */

.nav-label {
  display: block;

  flex: 1;
  min-width: 0;

  margin: 0;
  padding: 0;

  color: inherit;

  font-size: 14px;
  font-weight: 500;
  line-height: 20px;

  text-align: left;
  white-space: nowrap;
}

/* =========================================
   НАВЕДЕНИЕ
========================================= */

.nav-link:hover {
  color: #f5f7fa;
  background: #171a23;
}

/* =========================================
   АКТИВНЫЙ ПУНКТ
========================================= */

.nav-link.router-link-active,
.nav-link.router-link-exact-active {
  color: #c4b5fd;
  background: rgba(139, 92, 246, 0.15);
}

/* =========================================
   МОБИЛЬНАЯ НАВИГАЦИЯ
========================================= */

@media (max-width: 700px) {
  .app-navigation {
    top: auto;
    right: 0;
    bottom: 0;
    left: 0;

    width: 100%;
    height: 72px;

    padding: 5px 8px;

    box-sizing: border-box;

    flex-direction: row;
    align-items: center;
    justify-content: center;

    gap: 0;

    background: #0b0d12;

    border-top: 1px solid #292d3b;
    border-right: none;
  }

  /* Логотип на телефоне не нужен */

  .nav-logo {
    display: none;
  }

  /* Горизонтальное меню */

  .nav-links {
    display: flex;
    flex-direction: row;

    align-items: stretch;
    justify-content: space-around;

    width: 100%;
    height: 100%;

    gap: 4px;
  }

  /* Каждый пункт имеет одинаковую ширину */

  .nav-link {
    display: flex;
    flex: 1 1 0;

    flex-direction: column;
    align-items: center;
    justify-content: center;

    min-width: 0;
    min-height: 0;

    margin: 0;
    padding: 3px 2px;

    box-sizing: border-box;

    gap: 3px;

    border-radius: 9px;

    font-size: 10px;
    line-height: 14px;

    text-align: center;
  }

  /* Иконка занимает фиксированную область */

  .nav-icon {
    display: flex;
    align-items: center;
    justify-content: center;

    flex: 0 0 24px;

    width: 24px;
    height: 24px;

    margin: 0;
    padding: 0;

    font-size: 21px;
    line-height: 1;
  }

  .nav-icon ion-icon {
    width: 22px;
    height: 22px;
  }

  /* Текст располагается непосредственно под иконкой */

  .nav-label {
    display: block;

    flex: 0 0 auto;

    width: 100%;
    min-width: 0;
    min-height: 14px;

    margin: 0;
    padding: 0;

    font-size: 10px;
    font-weight: 500;
    line-height: 14px;

    text-align: center;
    white-space: nowrap;
  }
}

/* =========================================
   ОЧЕНЬ УЗКИЕ ЭКРАНЫ
========================================= */

@media (max-width: 360px) {
  .app-navigation {
    padding-right: 4px;
    padding-left: 4px;
  }

  .nav-links {
    gap: 2px;
  }

  .nav-link {
    gap: 2px;
    padding-right: 1px;
    padding-left: 1px;
  }

  .nav-icon {
    font-size: 20px;
  }

  .nav-icon ion-icon {
    width: 20px;
    height: 20px;
  }

  .nav-label {
    font-size: 9px;
  }
}

/* =========================================
   ДОСТУПНОСТЬ
========================================= */

.nav-link:focus-visible,
.nav-logo:focus-visible {
  outline: 2px solid #c4b5fd;
  outline-offset: 3px;
}

@media (prefers-reduced-motion: reduce) {
  .nav-link {
    transition: none;
  }
}
</style>