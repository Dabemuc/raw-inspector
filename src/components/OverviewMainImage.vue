<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import type { RandomAccessReader } from '../core/io'
import type { PreviewInfo } from '../core/model'
import type { DecodedImage, DecodeStatus } from '../composables/useRawDecode'
import type { DecodeStage } from '../workers/libraw-protocol'
import DecodePanel from './DecodePanel.vue'
import ImageViewer from './ImageViewer.vue'

const props = defineProps<{
  reader: RandomAccessReader | null
  fileName: string
  previews: PreviewInfo[]
  status: DecodeStatus
  progress: DecodeStage | null
  image: DecodedImage | null
  error: string | null
  fullResolution: boolean
}>()
const emit = defineEmits<{
  render: []
  'render-full': []
  cancel: []
}>()

const STAGES: Record<DecodeStage, string> = {
  loading: 'loading decoder',
  opening: 'reading file',
  unpacking: 'unpacking',
  processing: 'demosaicing',
}

type Source = 'render' | number

const pixels = (p: PreviewInfo) => (p.width ?? 0) * (p.height ?? 0)
const dims = (p: PreviewInfo) =>
  p.width && p.height ? `${p.width}×${p.height}` : 'unknown size'

/** Index of the largest preview by pixel count (bytes break ties). */
const largest = computed(() => {
  let best = -1
  props.previews.forEach((p, i) => {
    const b = props.previews[best]
    if (
      !b ||
      pixels(p) > pixels(b) ||
      (pixels(p) === pixels(b) && p.length > b.length)
    )
      best = i
  })
  return best
})

const choice = ref<Source | null>(null)
watch(
  () => props.previews,
  () => (choice.value = null),
)

const source = computed<Source | null>(() => {
  if (choice.value === 'render' && props.image) return 'render'
  if (typeof choice.value === 'number' && props.previews[choice.value])
    return choice.value
  if (props.image) return 'render'
  return largest.value >= 0 ? largest.value : null
})

const previewIndex = computed(() =>
  typeof source.value === 'number' ? source.value : null,
)

const urls = ref<Record<number, string>>({})
let created: string[] = []
let generation = 0
function revokeAll() {
  generation++
  for (const u of created) URL.revokeObjectURL(u)
  created = []
  urls.value = {}
}
watch([() => props.previews, () => props.reader], revokeAll)
onBeforeUnmount(revokeAll)

watch(
  [previewIndex, () => props.previews, () => props.reader],
  async ([index]) => {
    const preview = index === null ? null : props.previews[index]
    if (index === null || !preview || !props.reader || urls.value[index]) return
    const gen = generation
    try {
      const bytes = await props.reader.read(preview.offset, preview.length)
      if (gen !== generation) return
      const blob = new Blob([bytes as Uint8Array<ArrayBuffer>], {
        type: preview.mime,
      })
      const url = URL.createObjectURL(blob)
      created.push(url)
      urls.value = { ...urls.value, [index]: url }
    } catch {
      // The viewer stays empty; the badge still offers rendering.
    }
  },
  { immediate: true },
)

const baseName = computed(
  () => props.fileName.replace(/\.[^./\\]+$/, '') || 'file',
)
const previewUrl = computed(() =>
  previewIndex.value === null ? null : (urls.value[previewIndex.value] ?? null),
)
const previewDownloadName = computed(() => {
  const p =
    previewIndex.value === null ? null : props.previews[previewIndex.value]
  if (!p) return baseName.value
  const size = p.width && p.height ? `${p.width}x${p.height}` : `${p.length}B`
  return `${baseName.value}-preview-${size}`
})
const stageLabel = computed(() =>
  props.progress ? ` (${STAGES[props.progress]})` : '',
)
</script>

<template>
  <div class="main-image" data-testid="main-image">
    <div
      v-if="previews.length > 0"
      class="sources"
      role="group"
      aria-label="Image source"
    >
      <button
        type="button"
        data-testid="source-render"
        :disabled="!image"
        :aria-pressed="source === 'render'"
        @click="choice = 'render'"
      >
        Rendered RAW
      </button>
      <button
        v-for="(p, i) in previews"
        :key="p.nodeId + ':' + p.offset"
        type="button"
        data-testid="source-preview"
        :aria-pressed="source === i"
        @click="choice = i"
      >
        Preview {{ dims(p) }}
      </button>
    </div>

    <DecodePanel
      v-if="source === 'render' || source === null"
      :status="status"
      :progress="progress"
      :image="image"
      :error="error"
      :file-name="fileName"
      :full-resolution="fullResolution"
      @render="emit('render')"
      @render-full="emit('render-full')"
      @cancel="emit('cancel')"
    />
    <ImageViewer v-else :url="previewUrl" :download-name="previewDownloadName">
      <div v-if="!image" class="badge" data-testid="render-badge">
        <template v-if="status === 'decoding'">
          <span data-testid="render-badge-text"
            >Rendering RAW…{{ stageLabel }}</span
          >
          <button type="button" @click="emit('cancel')">Cancel</button>
        </template>
        <template v-else>
          <button
            type="button"
            data-testid="decode-button"
            @click="emit('render')"
          >
            Render RAW
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
      </div>
    </ImageViewer>
  </div>
</template>

<style scoped>
.main-image {
  min-width: 0;
}
.sources {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 8px;
}
.sources [aria-pressed='true'] {
  border-color: var(--accent);
}
.badge {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  border-radius: 8px;
  background: rgba(0, 0, 0, 0.7);
  color: #fff;
}
.error {
  color: #ff8a80;
}
</style>
