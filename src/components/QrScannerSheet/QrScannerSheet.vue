<template>
  <AppSheet :open="open" title="Сканировать QR" @close="$emit('close')">
    <div class="qr-scan">
      <div id="qr-reader" class="qr-reader" />
      <p v-if="error" class="qr-scan-err">{{ error }}</p>
      <p v-else class="qr-scan-hint">Наведите камеру на код с экрана ТВ или магнитолы.</p>
    </div>
  </AppSheet>
</template>

<script src="./QrScannerSheet.ts" lang="ts"></script>

<style scoped src="./QrScannerSheet.css"></style>
