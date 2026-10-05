<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import type { DecodedImage } from '../composables/useRawDecode'

const props = defineProps<{
  /** Decoded RGBA image (drawn on a canvas); wins over `url`. */
  image?: DecodedImage | null
  /** URL of an embedded JPEG; downloads give back the original bytes. */
  url?: string | null
  /** File name without extension used for downloads. */
  downloadName: string
}>()

const MIN_SCALE = 0.05
const MAX_SCALE = 16

/** `null` means fit to the viewport. */
const scale = ref<number | null>(null)
const canvas = ref<HTMLCanvasElement | null>(null)
const viewport = ref<HTMLElement | null>(null)
const urlSize = ref<{ width: number; height: number } | null>(null)

const natural = computed(() =>
  props.image
    ? { width: props.image.width, height: props.image.height }
    : urlSize.value,
)
const mediaStyle = computed(() =>
  scale.value && natural.value
    ? { width: `${natural.value.width * scale.value}px` }
    : undefined,
)
const hasMedia = computed(() => !!props.image || !!props.url)
const downloadHref = computed(() => (props.image ? null : props.url))
const jpegFileName = computed(() => `${props.downloadName}.jpg`)

function draw() {
  const el = canvas.value
  const img = props.image
  if (!el || !img) return
  el.width = img.width
  el.height = img.height
  const ctx = el.getContext('2d')
  ctx?.putImageData(new ImageData(img.rgba, img.width, img.height), 0, 0)
}

onMounted(draw)
watch(
  () => props.image,
  async () => {
    await nextTick()
    draw()
  },
  { flush: 'post' },
)
watch(
  () => props.url,
  () => {
    urlSize.value = null
    scale.value = null
  },
)

function onImgLoad(e: Event) {
  const el = e.target as HTMLImageElement
  urlSize.value = { width: el.naturalWidth, height: el.naturalHeight }
}

function zoomBy(factor: number) {
  const current = scale.value ?? currentFitScale()
  scale.value = Math.min(MAX_SCALE, Math.max(MIN_SCALE, current * factor))
}
function currentFitScale() {
  const n = natural.value
  const w = viewport.value?.clientWidth
  return n && w ? Math.min(1, w / n.width) : 1
}
function onWheel(e: WheelEvent) {
  if (!hasMedia.value) return
  e.preventDefault()
  zoomBy(e.deltaY < 0 ? 1.15 : 1 / 1.15)
}

function downloadPng() {
  canvas.value?.toBlob((blob) => {
    if (!blob) return
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${props.downloadName}.png`
    a.click()
    URL.revokeObjectURL(url)
  }, 'image/png')
}

// Drag-to-pan by scrolling the viewport.
let drag: { x: number; y: number; left: number; top: number } | null = null
function onPointerDown(e: PointerEvent) {
  const v = viewport.value
  if (!v || scale.value === null) return
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
  <div class="viewer" data-testid="image-viewer">
    <div class="toolbar">
      <button
        type="button"
        data-testid="zoom-fit"
        :aria-pressed="scale === null"
        @click="scale = null"
      >
        Fit
      </button>
      <button
        type="button"
        data-testid="zoom-actual"
        :aria-pressed="scale === 1"
        @click="scale = 1"
      >
        1:1
      </button>
      <button
        v-if="image"
        type="button"
        data-testid="download-png"
        @click="downloadPng"
      >
        Download PNG
      </button>
      <a
        v-else-if="downloadHref"
        class="button"
        data-testid="download-jpeg"
        :href="downloadHref"
        :download="jpegFileName"
      >
        Download JPEG
      </a>
      <span v-if="natural" class="size" data-testid="viewer-size">
        {{ natural.width }} × {{ natural.height }}
      </span>
      <slot name="toolbar" />
    </div>
    <div
      ref="viewport"
      class="viewport"
      :class="{ panning: scale !== null }"
      @wheel="onWheel"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointercancel="onPointerUp"
    >
      <canvas
        v-if="image"
        ref="canvas"
        :style="mediaStyle"
        data-testid="decode-canvas"
      ></canvas>
      <img
        v-else-if="url"
        :src="url"
        :style="mediaStyle"
        alt="Embedded preview"
        draggable="false"
        data-testid="viewer-image"
        @load="onImgLoad"
      />
      <div v-else class="empty" data-testid="viewer-empty">
        <slot name="empty" />
      </div>
      <div class="overlay"><slot /></div>
    </div>
  </div>
</template>

<style scoped>
.viewer {
  min-width: 0;
}
.toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 12px;
  margin-bottom: 8px;
}
.toolbar [aria-pressed='true'] {
  border-color: var(--accent);
}
.size {
  color: var(--text);
}
a.button {
  padding: 0.4em 0.8em;
  border: 1px solid var(--border);
  border-radius: 6px;
  text-decoration: none;
  color: inherit;
}
.viewport {
  position: relative;
  overflow: auto;
  max-height: 70vh;
  min-height: 160px;
  border: 1px solid var(--border);
  background: var(--panel-bg);
  touch-action: pan-x pan-y;
}
.viewport.panning {
  cursor: grab;
}
canvas,
img {
  display: block;
  max-width: 100%;
  height: auto;
  margin: 0 auto;
}
.panning canvas,
.panning img {
  max-width: none;
}
.empty {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 160px;
  padding: 16px;
}
.overlay {
  position: absolute;
  top: 8px;
  left: 8px;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 6px;
}
</style>
