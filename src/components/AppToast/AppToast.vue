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

<script setup lang="ts">
import { storeToRefs } from 'pinia';
import { useToastStore } from '@/stores/toast';

const { toast } = storeToRefs(useToastStore());
</script>
