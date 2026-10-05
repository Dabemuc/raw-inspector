<script setup lang="ts">
import { computed, ref } from 'vue'
import FileProblem from './components/FileProblem.vue'
import RenderStatus from './components/RenderStatus.vue'
import SummaryHeader from './components/SummaryHeader.vue'
import { fileProblem } from './core/model'
import { useInspection } from './composables/useInspection'
import OverviewView from './views/OverviewView.vue'
import TechnicalView from './views/TechnicalView.vue'

const inspection = useInspection()
const { status, result, error, errorKind } = inspection.parser
const showWarnings = ref(false)
const problem = computed(() =>
  result.value ? fileProblem(result.value) : null,
)

const input = ref<HTMLInputElement | null>(null)
const dragging = ref(false)
const fileName = inspection.fileName

function load(file: File | undefined) {
  if (!file) return
  showWarnings.value = false
  inspection.load(file)
}

function toggleWarnings() {
  // The warnings panel lives in the technical view.
  if (inspection.mode.value !== 'technical') {
    inspection.setMode('technical')
    showWarnings.value = true
  } else showWarnings.value = !showWarnings.value
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
      <FileProblem
        :problem="errorKind ?? 'read-error'"
        :detail="error"
        @open="pick"
      />
    </main>

    <template v-else-if="result">
      <SummaryHeader
        :file-name="fileName"
        :result="result"
        :mode="inspection.mode.value"
        @open="pick"
        @update:mode="inspection.setMode"
        @show-warnings="toggleWarnings"
      >
        <template #status>
          <RenderStatus
            v-model:auto-render="inspection.autoRender.value"
            :status="inspection.decoder.status.value"
            :progress="inspection.decoder.progress.value"
            :error="inspection.decoder.error.value"
          />
        </template>
      </SummaryHeader>
      <FileProblem
        v-if="problem"
        :problem="problem"
        :format-name="result.format?.name"
        :has-result="true"
        @open="pick"
      />
      <TechnicalView
        v-if="inspection.mode.value === 'technical'"
        :show-warnings="showWarnings"
        @close-warnings="showWarnings = false"
      />
      <OverviewView v-else />
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
</style>
