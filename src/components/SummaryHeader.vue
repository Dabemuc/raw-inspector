<script setup lang="ts">
import { computed } from 'vue'
import { collectIssues } from '../core/model'
import type { ParseResult } from '../core/model'
import type { InspectionMode } from '../composables/useInspection'

const props = defineProps<{
  fileName: string
  result: ParseResult
  mode?: InspectionMode
}>()
defineEmits<{
  open: []
  'show-warnings': []
  'update:mode': [mode: InspectionMode]
}>()

const modes: { value: InspectionMode; label: string }[] = [
  { value: 'overview', label: 'Overview' },
  { value: 'technical', label: 'Technical' },
]

const camera = computed(() => {
  const f = props.result.format
  return [f?.make, f?.model].filter(Boolean).join(' ') || 'Unknown'
})

const issueCount = computed(() => collectIssues(props.result).length)

const size = computed(() => formatSize(props.result.fileSize))

function formatSize(bytes: number): string {
  const units = ['B', 'KiB', 'MiB', 'GiB']
  let value = bytes
  let i = 0
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024
    i++
  }
  return `${i === 0 ? value : value.toFixed(1)} ${units[i]}`
}
</script>

<template>
  <header class="summary" data-testid="summary">
    <div class="name" data-testid="summary-name">{{ fileName }}</div>
    <dl>
      <div>
        <dt>Size</dt>
        <dd data-testid="summary-size">{{ size }}</dd>
      </div>
      <div>
        <dt>Format</dt>
        <dd data-testid="summary-format">
          {{ result.format?.name ?? 'Unknown' }}
        </dd>
      </div>
      <div>
        <dt>Camera</dt>
        <dd data-testid="summary-camera">{{ camera }}</dd>
      </div>
      <div>
        <dt>Warnings</dt>
        <dd>
          <button
            type="button"
            class="badge"
            :class="{ has: issueCount > 0 }"
            data-testid="summary-warnings"
            @click="$emit('show-warnings')"
          >
            {{ issueCount }}
          </button>
        </dd>
      </div>
    </dl>
    <div class="mode-switch" role="group" aria-label="View mode">
      <button
        v-for="m in modes"
        :key="m.value"
        type="button"
        :data-testid="`mode-${m.value}`"
        :aria-pressed="mode === m.value"
        @click="$emit('update:mode', m.value)"
      >
        {{ m.label }}
      </button>
    </div>
    <div class="status-area" data-testid="status-area" aria-live="polite">
      <slot name="status" />
    </div>
    <button type="button" data-testid="open-another" @click="$emit('open')">
      Open another file
    </button>
  </header>
</template>

<style scoped>
.summary {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px 24px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border);
}
.name {
  font-weight: 600;
  color: var(--text-h);
  overflow-wrap: anywhere;
}
dl {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 24px;
  margin: 0;
  flex: 1;
}
dt {
  font-size: 0.75rem;
  text-transform: uppercase;
}
dd {
  margin: 0;
  color: var(--text-h);
}
[data-testid='open-another'] {
  margin-left: auto;
}
.mode-switch {
  display: inline-flex;
}
.mode-switch button[aria-pressed='true'] {
  border-color: var(--accent);
  font-weight: 600;
}
.status-area {
  display: flex;
  gap: 8px;
}
.badge.has {
  border-color: var(--accent);
  font-weight: 600;
}
</style>
