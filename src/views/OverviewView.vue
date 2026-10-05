<script setup lang="ts">
import KeyFactsCard from '../components/KeyFactsCard.vue'
import CameraPanel from '../components/CameraPanel.vue'
import MetadataBrowser from '../components/MetadataBrowser.vue'
import OverviewMainImage from '../components/OverviewMainImage.vue'
import PlaceholderPanel from '../components/PlaceholderPanel.vue'
import { computed } from 'vue'
import { useInspection } from '../composables/useInspection'
import { buildKeyFacts } from '../metadata/keyFacts'
import { buildTagIndex } from '../metadata/tagIndex'

const {
  reader,
  fileName,
  decoder,
  fullResolution,
  render,
  renderFull,
  parseResult,
  file,
  metadata,
  setMode,
  selectNode,
} = useInspection()

const facts = computed(() =>
  buildKeyFacts(metadata.result.value, {
    format: parseResult.value?.format?.name,
    fileSize: file.value?.size,
  }),
)
const tagIndex = computed(() =>
  parseResult.value ? buildTagIndex(parseResult.value) : null,
)
function showInFile(nodeId: string) {
  selectNode(nodeId)
  setMode('technical')
}
</script>

<template>
  <div class="overview" data-testid="overview-view">
    <div class="top">
      <div class="main" data-testid="overview-main">
        <OverviewMainImage
          :reader="reader"
          :file-name="fileName"
          :previews="parseResult?.previews ?? []"
          :status="decoder.status.value"
          :progress="decoder.progress.value"
          :image="decoder.image.value"
          :error="decoder.error.value"
          :full-resolution="fullResolution"
          @render="render()"
          @render-full="renderFull()"
          @cancel="decoder.cancel()"
          @show-in-file="showInFile"
        />
      </div>
      <aside class="facts" data-testid="slot-key-facts">
        <KeyFactsCard
          :facts="facts"
          :loading="metadata.status.value === 'loading'"
          :tag-index="tagIndex"
          @show-in-file="showInFile"
        />
      </aside>
    </div>

    <!-- Slot: metadata browser (#34). -->
    <section data-testid="slot-metadata">
      <PlaceholderPanel title="Metadata">
        <MetadataBrowser
          :result="metadata.result.value"
          :status="metadata.status.value"
          :file-name="fileName"
          :tag-index="tagIndex"
          @show-in-file="showInFile"
        />
      </PlaceholderPanel>
    </section>

    <details class="sensor" data-testid="sensor-colour">
      <summary>Sensor &amp; colour</summary>
      <CameraPanel :metadata="decoder.metadata.value" />
    </details>
  </div>
</template>

<style scoped>
.overview {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 12px;
  min-width: 0;
}
.top {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 12px;
}
.main,
.facts {
  min-width: 0;
}
@media (min-width: 900px) {
  .top {
    grid-template-columns: minmax(0, 2fr) minmax(240px, 1fr);
    align-items: start;
  }
}
.sensor {
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 8px 16px;
  background: var(--panel-bg);
}
.sensor summary {
  cursor: pointer;
  font-weight: 600;
}
</style>
