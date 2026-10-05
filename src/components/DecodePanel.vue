<script setup lang="ts">
import { computed } from 'vue'
import type { DecodedImage, DecodeStatus } from '../composables/useRawDecode'
import ImageViewer from './ImageViewer.vue'
import type { DecodeStage } from '../workers/libraw-protocol'

const props = defineProps<{
  status: DecodeStatus
  progress: DecodeStage | null
  image: DecodedImage | null
  error: string | null
  fileName: string
  fullResolution?: boolean
}>()
const emit = defineEmits<{
  render: []
  'render-full': []
  cancel: []
}>()

const STAGES: Record<DecodeStage, string> = {
  loading: 'Loading decoder…',
  opening: 'Reading file…',
  unpacking: 'Unpacking sensor data…',
  processing: 'Demosaicing…',
}

const stageLabel = computed(() =>
  props.progress ? STAGES[props.progress] : 'Starting…',
)
</script>

<template>
  <div class="decode" data-testid="decode-panel">
    <div v-if="!image && status !== 'decoding'" class="controls">
      <button type="button" data-testid="decode-button" @click="emit('render')">
        Render RAW
      </button>
      <p v-if="error" class="error" role="alert" data-testid="decode-error">
        {{ error }}
      </p>
    </div>

    <div
      v-if="status === 'decoding'"
      class="busy"
      data-testid="decode-progress"
    >
      <div class="spinner" role="status" aria-label="Decoding"></div>
      <span>{{ stageLabel }}</span>
      <button type="button" @click="emit('cancel')">Cancel</button>
    </div>

    <ImageViewer
      v-if="image"
      :image="image"
      :download-name="fileName.replace(/\.[^./\\]+$/, '') || 'file'"
    >
      <template #toolbar>
        <button
          v-if="!fullResolution"
          type="button"
          data-testid="render-full"
          @click="emit('render-full')"
        >
          Render full resolution
        </button>
        <span
          v-if="error"
          class="error"
          role="alert"
          data-testid="decode-error"
        >
          {{ error }}
        </span>
      </template>
    </ImageViewer>
  </div>
</template>

<style scoped>
.controls,
.busy {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
}
.error {
  flex-basis: 100%;
  margin: 0;
  color: #c0392b;
}
.spinner {
  width: 20px;
  height: 20px;
  border: 3px solid var(--border);
  border-top-color: var(--accent);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
