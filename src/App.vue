<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import HexViewer from './components/HexViewer.vue'
import PlaceholderPanel from './components/PlaceholderPanel.vue'
import StructureTree from './components/StructureTree.vue'
import SummaryHeader from './components/SummaryHeader.vue'
import { createFileReader } from './core/io'
import { useSelection } from './composables/useSelection'
import CameraPanel from './components/CameraPanel.vue'
import DecodePanel from './components/DecodePanel.vue'
import { useRawDecode } from './composables/useRawDecode'
import { useStructureParser } from './composables/useStructureParser'

const parser = useStructureParser()
const { status, result, error } = parser
const { setParseResult } = useSelection()
watch(result, (r) => setParseResult(r), { immediate: true })

const currentFile = ref<File | null>(null)
const reader = computed(() =>
  currentFile.value ? createFileReader(currentFile.value) : null,
)

const decoder = useRawDecode()

const input = ref<HTMLInputElement | null>(null)
const fileName = ref('')
const dragging = ref(false)
const tab = ref<'hex' | 'previews' | 'image'>('hex')

function load(file: File | undefined) {
  if (!file) return
  fileName.value = file.name
  currentFile.value = file
  decoder.cancel()
  parser.parse(file)
}

function pick() {
  input.value?.click()
}

function onChange(event: Event) {
  const el = event.target as HTMLInputElement
  load(el.files?.[0])
  el.value = ''
}

function onDragOver(event: DragEvent) {
  if (!event.dataTransfer?.types?.includes('Files')) return
  event.preventDefault()
  dragging.value = true
}

function onDrop(event: DragEvent) {
  event.preventDefault()
  dragging.value = false
  load(event.dataTransfer?.files?.[0])
}
</script>

<template>
  <div
    class="app"
    :class="{ dragging }"
    data-testid="app"
    @dragover="onDragOver"
    @dragleave.self="dragging = false"
    @drop="onDrop"
  >
    <input
      ref="input"
      type="file"
      hidden
      data-testid="file-input"
      @change="onChange"
    />

    <main v-if="status === 'idle'" class="empty" data-testid="empty-state">
      <h1>RAW-Inspector</h1>
      <p class="tagline">
        The easiest and quickest way to inspect the structure and contents of a
        RAW image file.
      </p>
      <div class="dropzone">
        <p>Drop a RAW file here</p>
        <button type="button" data-testid="choose-file" @click="pick">
          Choose file
        </button>
      </div>
      <p class="formats">Supported formats: DNG, ARW, NEF, CR2, ORF, RW2</p>
      <p class="privacy">
        <strong>Your files never leave your device.</strong> Everything is
        parsed locally in your browser.
      </p>
    </main>

    <main v-else-if="status === 'parsing'" class="state" data-testid="parsing">
      <div class="spinner" role="status" aria-label="Parsing"></div>
      <p>Parsing {{ fileName }}…</p>
    </main>

    <main v-else-if="status === 'error'" class="state" data-testid="error">
      <h2>Could not parse file</h2>
      <p>{{ error }}</p>
      <button type="button" @click="pick">Open another file</button>
    </main>

    <template v-else-if="result">
      <SummaryHeader :file-name="fileName" :result="result" @open="pick" />
      <div class="layout">
        <PlaceholderPanel class="area-map" title="Byte map" />
        <StructureTree class="area-tree" />
        <div class="area-detail">
          <div class="tabs" role="tablist">
            <button
              type="button"
              role="tab"
              :aria-selected="tab === 'hex'"
              @click="tab = 'hex'"
            >
              Hex
            </button>
            <button
              type="button"
              role="tab"
              :aria-selected="tab === 'previews'"
              @click="tab = 'previews'"
            >
              Previews
            </button>
            <button
              type="button"
              role="tab"
              data-testid="tab-image"
              :aria-selected="tab === 'image'"
              @click="tab = 'image'"
            >
              Decoded image
            </button>
          </div>
          <template v-if="tab === 'hex'">
            <HexViewer v-if="reader" :reader="reader" />
            <PlaceholderPanel v-else title="Hex viewer" />
          </template>
          <PlaceholderPanel v-else-if="tab === 'previews'" title="Previews" />
          <PlaceholderPanel v-else title="Decoded image">
            <DecodePanel
              :status="decoder.status.value"
              :progress="decoder.progress.value"
              :image="decoder.image.value"
              :error="decoder.error.value"
              :file-name="fileName"
              @decode="
                (options) => currentFile && decoder.decode(currentFile, options)
              "
              @cancel="decoder.cancel()"
            />
          </PlaceholderPanel>
          <PlaceholderPanel
            v-if="tab === 'image'"
            class="camera-panel"
            title="Camera & colour"
          >
            <CameraPanel :metadata="decoder.metadata.value" />
          </PlaceholderPanel>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.app {
  min-height: 100svh;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  border: 3px dashed transparent;
}
.app.dragging {
  border-color: var(--accent);
  background: var(--accent-bg);
}
.empty,
.state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  padding: 24px 16px;
  text-align: center;
}
.tagline {
  max-width: 36rem;
}
.dropzone {
  width: min(32rem, 100%);
  box-sizing: border-box;
  padding: 48px 16px;
  border: 2px dashed var(--accent-border);
  border-radius: 12px;
  background: var(--accent-bg);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}
.privacy {
  color: var(--text-h);
}
.spinner {
  width: 32px;
  height: 32px;
  border: 4px solid var(--border);
  border-top-color: var(--accent);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
.layout {
  display: grid;
  gap: 12px;
  padding: 12px;
  grid-template-columns: minmax(0, 1fr);
  grid-template-areas: 'map' 'tree' 'detail';
}
.area-map {
  grid-area: map;
}
.area-tree {
  grid-area: tree;
}
.area-detail {
  grid-area: detail;
  min-width: 0;
}
.camera-panel {
  margin-top: 12px;
}
.tabs {
  display: flex;
  gap: 4px;
  margin-bottom: 8px;
}
.tabs [aria-selected='true'] {
  border-color: var(--accent);
}
@media (min-width: 800px) {
  .layout {
    grid-template-columns: minmax(240px, 1fr) minmax(0, 2fr);
    grid-template-areas: 'map map' 'tree detail';
  }
}
</style>
