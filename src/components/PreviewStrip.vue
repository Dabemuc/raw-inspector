<script setup lang="ts">
import { nextTick, onMounted, ref, watch } from 'vue'
import type { DecodedImage } from '../composables/useRawDecode'
import type { PreviewInfo } from '../core/model'

const props = defineProps<{
  previews: PreviewInfo[]
  /** Object URLs by preview index; missing while still loading. */
  urls: Record<number, string>
  /** The rendered RAW; shown as the first entry once available. */
  image: DecodedImage | null
  /** Active source: `'render'` or a preview index. */
  source: 'render' | number | null
  downloadBase: string
}>()
const emit = defineEmits<{
  select: [source: 'render' | number]
  'show-in-file': [nodeId: string]
}>()

const canvas = ref<HTMLCanvasElement | null>(null)

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
onMounted(draw)
watch(
  () => props.image,
  async () => {
    await nextTick()
    draw()
  },
  { flush: 'post' },
)

const dims = (p: PreviewInfo) =>
  p.width && p.height ? `${p.width}×${p.height}` : 'unknown size'

function downloadName(p: PreviewInfo) {
  const size = p.width && p.height ? `${p.width}x${p.height}` : `${p.length}B`
  return `${props.downloadBase}-preview-${size}.jpg`
}
</script>

<template>
  <div class="strip" data-testid="preview-strip">
    <div v-if="image" class="item" :class="{ active: source === 'render' }">
      <button
        type="button"
        class="thumb"
        data-testid="source-render"
        :aria-pressed="source === 'render'"
        @click="emit('select', 'render')"
      >
        <canvas ref="canvas" />
      </button>
      <span class="caption"
        >Rendered RAW {{ image.width }}×{{ image.height }}</span
      >
    </div>
    <div
      v-for="(p, i) in previews"
      :key="p.nodeId + ':' + p.offset"
      class="item"
      :class="{ active: source === i }"
      data-testid="preview-item"
    >
      <button
        type="button"
        class="thumb"
        data-testid="source-preview"
        :aria-pressed="source === i"
        @click="emit('select', i)"
      >
        <img v-if="urls[i]" :src="urls[i]" alt="Embedded preview" />
        <span v-else class="muted">Loading…</span>
      </button>
      <span class="caption"
        >{{ dims(p) }} · {{ p.length.toLocaleString() }} B</span
      >
      <span class="actions">
        <button
          type="button"
          data-testid="show-in-file"
          @click="emit('show-in-file', p.nodeId)"
        >
          Show in file
        </button>
        <a
          v-if="urls[i]"
          data-testid="preview-download"
          :href="urls[i]"
          :download="downloadName(p)"
        >
          Download
        </a>
      </span>
    </div>
  </div>
</template>

<style scoped>
.strip {
  display: flex;
  gap: 12px;
  overflow-x: auto;
  padding: 4px 0;
}
.item {
  flex: 0 0 auto;
  width: 160px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 6px;
  background: var(--panel-bg);
}
.item.active {
  border-color: var(--accent);
  background: var(--accent-bg);
}
.thumb {
  height: 90px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  overflow: hidden;
}
.thumb img,
.thumb canvas {
  max-width: 100%;
  max-height: 100%;
}
.caption {
  font-size: 0.8rem;
}
.actions {
  display: flex;
  justify-content: space-between;
  gap: 6px;
  font-size: 0.8rem;
}
.muted {
  color: var(--text);
}
</style>
