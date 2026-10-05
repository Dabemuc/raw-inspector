<script setup lang="ts">
import { computed } from 'vue'
import ByteMap from '../components/ByteMap.vue'
import HexViewer from '../components/HexViewer.vue'
import PlaceholderPanel from '../components/PlaceholderPanel.vue'
import StructureTree from '../components/StructureTree.vue'
import WarningsPanel from '../components/WarningsPanel.vue'
import { useInspection } from '../composables/useInspection'

defineProps<{ showWarnings: boolean }>()
defineEmits<{ 'close-warnings': [] }>()

const { parser, reader } = useInspection()
const result = computed(() => parser.result.value)
</script>

<template>
  <div data-testid="technical-view">
    <WarningsPanel
      v-if="showWarnings && result"
      :result="result"
      @close="$emit('close-warnings')"
    />
    <div class="layout">
      <ByteMap class="area-map" />
      <StructureTree class="area-tree" />
      <div class="area-detail">
        <HexViewer v-if="reader" :reader="reader" />
        <PlaceholderPanel v-else title="Hex viewer" />
      </div>
    </div>
  </div>
</template>

<style scoped>
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
@media (min-width: 800px) {
  .layout {
    grid-template-columns: minmax(240px, 1fr) minmax(0, 2fr);
    grid-template-areas: 'map map' 'tree detail';
  }
}
</style>
