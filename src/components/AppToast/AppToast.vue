<template>
  <Teleport to="body">
    <div v-if="toast" class="sky-toast toast">
      <div>
        <strong>{{ toast.title }}</strong>
        <div class="who">{{ toast.who }}</div>
      </div>
    </div>
  </Teleport>
</template>

<script src="./AppToast.ts" lang="ts"></script>
