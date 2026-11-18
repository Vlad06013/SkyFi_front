<template>
  <EntityMenu
    :open="open"
    :top="top"
    :right="right"
    :variant="variant"
    :entity="entity"
    @close="emit('close')"
    @action="emit('action', $event)"
  />
  <MediaActionSheet
    :sheet="sheet"
    :entity="entity"
    @update:sheet="emit('update:sheet', $event)"
  />
</template>

<script src="./MediaOverlays.ts" lang="ts"></script>
