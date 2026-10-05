<script setup lang="ts">
import { computed } from 'vue'
import type { MetadataStatus } from '../composables/useMetadata'

const props = defineProps<{
  status: MetadataStatus
  error: string | null
}>()

const label = computed(() => {
  if (props.status === 'loading') return 'Reading metadata…'
  if (props.status === 'failed') return 'Metadata failed'
  return ''
})
</script>

<template>
  <span
    v-if="label"
    class="metadata-status"
    :class="status"
    :title="status === 'failed' ? (error ?? undefined) : undefined"
    data-testid="metadata-status"
  >
    {{ label }}
  </span>
</template>

<style scoped>
.metadata-status.failed {
  color: #c0392b;
  cursor: help;
}
</style>
