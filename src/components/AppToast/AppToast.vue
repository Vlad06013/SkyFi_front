<template>
  <Teleport to="body">
    <div v-if="toast" class="sky-toast toast" :class="{ 'is-error': toast.error }">
      <div>
        <strong>{{ toast.title }}</strong>
        <div v-if="toast.who" class="who">{{ toast.who }}</div>
      </div>
    </div>
  </Teleport>
</template>

<script src="./AppToast.ts" lang="ts"></script>

<style scoped src="./AppToast.css"></style>
