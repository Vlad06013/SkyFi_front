<template>
  <Teleport to="body">
    <div v-if="open" class="confirm-mask" @click.self="close">
      <div class="confirm-sheet" role="alertdialog" :aria-label="title">
        <div class="handle" />
        <div class="confirm-title">{{ title }}</div>
        <div v-if="message" class="confirm-msg">{{ message }}</div>
        <div class="confirm-actions">
          <button
            class="btn confirm-btn"
            :class="danger ? 'btn-danger' : 'btn-primary'"
            type="button"
            :disabled="confirmDisabled"
            @click="onConfirm"
          >
            {{ confirmLabel }}
          </button>
          <button v-if="!locked" class="btn btn-secondary confirm-btn" type="button" @click="close">
            {{ cancelLabel }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script src="./AppConfirm.ts" lang="ts"></script>

<style scoped src="./AppConfirm.css"></style>
