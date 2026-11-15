<template>
  <ion-app>
    <div class="placeholder">
      <div class="logo">SkyFi</div>
      <div class="hint">Каркас очищен — скоро здесь будет новый интерфейс.</div>
    </div>
  </ion-app>
</template>

<script setup lang="ts">
import { IonApp } from '@ionic/vue';
</script>

<style>
html,
body,
#app {
  height: 100%;
  background: #141413;
}

.placeholder {
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  color: #f4f3ee;
  font-family: system-ui, sans-serif;
}

.placeholder .logo {
  font-size: 34px;
  font-weight: 800;
  letter-spacing: 0.02em;
}

.placeholder .hint {
  font-size: 13px;
  color: #a3a19a;
}
</style>
