<template>
  <EntityMenu
    :open="open"
    :top="top"
    :right="right"
    :variant="variant"
    @close="emit('close')"
    @action="emit('action', $event)"
  />
  <MediaActionSheet
    :sheet="sheet"
    :entity="entity"
    @update:sheet="emit('update:sheet', $event)"
  />
</template>

<script setup lang="ts">
import EntityMenu from '@/components/EntityMenu/EntityMenu.vue';
import MediaActionSheet from '@/components/MediaActionSheet/MediaActionSheet.vue';
import type { MediaSheet, MenuAction, MenuEntity, MenuVariant } from '@/lib/media-menu';

defineProps<{
  open: boolean;
  top: number;
  right: number;
  variant: MenuVariant;
  sheet: MediaSheet;
  entity: MenuEntity;
}>();

const emit = defineEmits<{
  close: [];
  action: [action: MenuAction];
  'update:sheet': [sheet: MediaSheet];
}>();
</script>
