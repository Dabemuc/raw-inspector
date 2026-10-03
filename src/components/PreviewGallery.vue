<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'
import { useSelection } from '../composables/useSelection'
import type { RandomAccessReader } from '../core/io'
import type { PreviewInfo } from '../core/model'

const props = defineProps<{ reader: RandomAccessReader; fileName: string }>()

interface Card {
  preview: PreviewInfo
  url: string | null
  error: string | null
}

const { parseResult, selectedNodeId, selectNode } = useSelection()
const cards = ref<Card[]>([])
const full = ref<Card | null>(null)
const zoom = ref<'fit' | '1:1'>('fit')

let urls: string[] = []
let generation = 0

function revokeAll() {
  for (const url of urls) URL.revokeObjectURL(url)
  urls = []
}

async function load() {
  const gen = ++generation
  revokeAll()
  full.value = null
  const previews = parseResult.value?.previews ?? []
  cards.value = previews.map((preview) => ({ preview, url: null, error: null }))
  const loaded = await Promise.all(
    previews.map(async (preview): Promise<Card> => {
      try {
        const bytes = await props.reader.read(preview.offset, preview.length)
        const blob = new Blob([bytes as Uint8Array<ArrayBuffer>], {
          type: preview.mime,
        })
        return { preview, url: URL.createObjectURL(blob), error: null }
      } catch (e) {
        return {
          preview,
          url: null,
          error: e instanceof Error ? e.message : String(e),
        }
      }
    }),
  )
  if (gen !== generation) {
    for (const c of loaded) if (c.url) URL.revokeObjectURL(c.url)
    return
  }
  urls = loaded.flatMap((c) => (c.url ? [c.url] : []))
  cards.value = loaded
}

watch([parseResult, () => props.reader], load, { immediate: true })

onBeforeUnmount(() => {
  generation++
  revokeAll()
})

function onImageError(card: Card) {
  card.error = 'The browser could not decode this preview.'
}

function openFull(card: Card) {
  zoom.value = 'fit'
  full.value = card
}

function dims(p: PreviewInfo) {
  return p.width && p.height ? `${p.width}×${p.height}` : 'unknown size'
}

function downloadName(p: PreviewInfo) {
  const base = props.fileName.replace(/\.[^./\\]+$/, '') || 'file'
  const size = p.width && p.height ? `${p.width}x${p.height}` : `${p.length}B`
  return `${base}-preview-${size}.jpg`
}
</script>

<template>
  <div class="gallery" data-testid="preview-gallery">
    <p v-if="cards.length === 0" class="muted">
      No embedded previews found in this file.
    </p>
    <div
      v-for="card in cards"
      :key="card.preview.nodeId + ':' + card.preview.offset"
      class="card"
      :class="{ selected: card.preview.nodeId === selectedNodeId }"
      data-testid="preview-card"
      @click="selectNode(card.preview.nodeId)"
    >
      <div class="thumb">
        <p v-if="card.error" class="error" data-testid="preview-error">
          {{ card.error }}
        </p>
        <img
          v-else-if="card.url"
          :src="card.url"
          alt="Embedded preview"
          data-testid="preview-image"
          @click.stop="openFull(card)"
          @error="onImageError(card)"
        />
        <span v-else class="muted">Loading…</span>
      </div>
      <dl>
        <dt>Size</dt>
        <dd>{{ dims(card.preview) }}</dd>
        <dt>Bytes</dt>
        <dd>{{ card.preview.length.toLocaleString() }}</dd>
        <dt>Offset</dt>
        <dd>{{ card.preview.offset }}</dd>
      </dl>
      <a
        v-if="card.url && !card.error"
        class="download"
        data-testid="preview-download"
        :href="card.url"
        :download="downloadName(card.preview)"
        @click.stop
      >
        Download
      </a>
    </div>

    <div
      v-if="full && full.url"
      class="overlay"
      data-testid="preview-full"
      @click.self="full = null"
    >
      <div class="bar">
        <button
          type="button"
          data-testid="preview-zoom"
          @click="zoom = zoom === 'fit' ? '1:1' : 'fit'"
        >
          {{ zoom === 'fit' ? '1:1' : 'Fit' }}
        </button>
        <button type="button" data-testid="preview-close" @click="full = null">
          Close
        </button>
      </div>
      <div class="viewport" @click.self="full = null">
        <img
          :src="full.url"
          alt="Full-size preview"
          :class="zoom === 'fit' ? 'fit' : 'actual'"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.gallery {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 12px;
}
.muted {
  color: var(--text);
}
.card {
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 8px;
  cursor: pointer;
  background: var(--panel-bg);
}
.card.selected {
  border-color: var(--accent);
  background: var(--accent-bg);
}
.thumb {
  min-height: 80px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.thumb img {
  max-width: 100%;
  max-height: 160px;
  cursor: zoom-in;
}
.error {
  color: #c0392b;
  font-size: 0.85rem;
}
dl {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 2px 8px;
  margin: 8px 0;
  font-size: 0.85rem;
}
dt {
  color: var(--text);
}
dd {
  margin: 0;
  text-align: right;
}
.overlay {
  position: fixed;
  inset: 0;
  z-index: 10;
  background: rgba(0, 0, 0, 0.85);
  display: flex;
  flex-direction: column;
}
.bar {
  display: flex;
  gap: 8px;
  padding: 8px;
  justify-content: flex-end;
}
.viewport {
  flex: 1;
  overflow: auto;
  display: flex;
}
.viewport img.fit {
  max-width: 100%;
  max-height: 100%;
  margin: auto;
  object-fit: contain;
}
.viewport img.actual {
  max-width: none;
  margin: auto;
}
</style>
