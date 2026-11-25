<template>
  <Teleport to="body">
    <div v-if="toast" class="sky-toast toast" :class="{ 'is-error': toast.error, 'has-action': toast.action }">
      <div>
        <strong>{{ toast.title }}</strong>
        <div v-if="toast.who" class="who">{{ toast.who }}</div>
      </div>
      <button v-if="toast.action" class="btn btn-ghost sm" type="button" @click="runAction">
        {{ toast.action.label }}
      </button>
    </div>
  </Teleport>
</template>

<script src="./AppToast.ts" lang="ts"></script>

<style scoped src="./AppToast.css"></style>
