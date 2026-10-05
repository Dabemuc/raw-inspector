<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import type { DecodedImage, DecodeStatus } from '../composables/useRawDecode'
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

const zoom = ref<'fit' | '1:1'>('fit')
const canvas = ref<HTMLCanvasElement | null>(null)
const viewport = ref<HTMLElement | null>(null)

const stageLabel = computed(() =>
  props.progress ? STAGES[props.progress] : 'Starting…',
)

function draw() {
  const el = canvas.value
  const img = props.image
  if (!el || !img) return
  el.width = img.width
  el.height = img.height
  el.getContext('2d')?.putImageData(
    new ImageData(img.rgba, img.width, img.height),
    0,
    0,
  )
}

watch(
  () => props.image,
  async () => {
    await nextTick()
    draw()
  },
  { flush: 'post' },
)

function download() {
  canvas.value?.toBlob((blob) => {
    if (!blob) return
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = props.fileName.replace(/\.[^.]*$/, '') + '.png'
    a.click()
    URL.revokeObjectURL(url)
  }, 'image/png')
}

// Drag-to-pan by scrolling the viewport (used in 1:1 mode).
let drag: { x: number; y: number; left: number; top: number } | null = null
function onPointerDown(e: PointerEvent) {
  const v = viewport.value
  if (!v || zoom.value !== '1:1') return
  drag = { x: e.clientX, y: e.clientY, left: v.scrollLeft, top: v.scrollTop }
  v.setPointerCapture?.(e.pointerId)
}
function onPointerMove(e: PointerEvent) {
  const v = viewport.value
  if (!drag || !v) return
  v.scrollLeft = drag.left - (e.clientX - drag.x)
  v.scrollTop = drag.top - (e.clientY - drag.y)
}
function onPointerUp() {
  drag = null
}
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

    <template v-if="image">
      <div class="toolbar">
        <button
          type="button"
          :aria-pressed="zoom === 'fit'"
          @click="zoom = 'fit'"
        >
          Fit
        </button>
        <button
          type="button"
          :aria-pressed="zoom === '1:1'"
          @click="zoom = '1:1'"
        >
          1:1
        </button>
        <button type="button" data-testid="download-png" @click="download">
          Download PNG
        </button>
        <button
          v-if="!fullResolution"
          type="button"
          data-testid="render-full"
          @click="emit('render-full')"
        >
          Render full resolution
        </button>
        <span class="size">{{ image.width }} × {{ image.height }}</span>
        <span
          v-if="error"
          class="error"
          role="alert"
          data-testid="decode-error"
        >
          {{ error }}
        </span>
      </div>
      <div
        ref="viewport"
        class="viewport"
        :class="zoom"
        @pointerdown="onPointerDown"
        @pointermove="onPointerMove"
        @pointerup="onPointerUp"
        @pointercancel="onPointerUp"
      >
        <canvas ref="canvas" data-testid="decode-canvas"></canvas>
      </div>
    </template>
  </div>
</template>

<style scoped>
.controls,
.busy,
.toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
}
.toolbar {
  margin-bottom: 8px;
}
.toolbar [aria-pressed='true'] {
  border-color: var(--accent);
}
.size {
  color: var(--text);
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
.viewport {
  overflow: auto;
  max-height: 70vh;
  border: 1px solid var(--border);
  background: var(--panel-bg);
}
.viewport.fit canvas {
  display: block;
  max-width: 100%;
  height: auto;
  margin: 0 auto;
}
.viewport.\31\:1 {
  cursor: grab;
}
.viewport.\31\:1 canvas {
  display: block;
  max-width: none;
}
</style>
