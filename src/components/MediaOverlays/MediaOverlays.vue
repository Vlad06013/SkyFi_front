<template>
  <EntityMenu
    :open="open"
    :top="top"
    :right="right"
    :items="items"
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
