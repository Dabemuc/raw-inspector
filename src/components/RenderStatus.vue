<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import type { DecodeStatus } from '../composables/useRawDecode'
import type { DecodeStage } from '../workers/libraw-protocol'

const props = defineProps<{
  status: DecodeStatus
  progress: DecodeStage | null
  error: string | null
}>()
const autoRender = defineModel<boolean>('autoRender', { default: true })

const STAGES: Record<DecodeStage, string> = {
  loading: 'loading decoder',
  opening: 'reading file',
  unpacking: 'unpacking',
  processing: 'demosaicing',
}

/** "Rendered" is only shown briefly after a render finishes. */
const showDone = ref(false)
let timer: ReturnType<typeof setTimeout> | undefined
watch(
  () => props.status,
  (s) => {
    clearTimeout(timer)
    showDone.value = s === 'done'
    if (s === 'done') timer = setTimeout(() => (showDone.value = false), 3000)
  },
)
onBeforeUnmount(() => clearTimeout(timer))

const label = computed(() => {
  if (props.status === 'decoding')
    return props.progress
      ? `Rendering… (${STAGES[props.progress]})`
      : 'Rendering…'
  if (props.status === 'error') return 'Render failed'
  if (showDone.value) return 'Rendered'
  return ''
})
</script>

<template>
  <span
    v-if="label"
    class="render-status"
    :class="status"
    :title="status === 'error' ? (error ?? undefined) : undefined"
    data-testid="render-status"
  >
    {{ label }}
  </span>
  <label class="auto-render">
    <input
      v-model="autoRender"
      type="checkbox"
      data-testid="auto-render-toggle"
    />
    Auto-render
  </label>
</template>

<style scoped>
.render-status.error {
  color: #c0392b;
  cursor: help;
}
.auto-render {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
</style>
