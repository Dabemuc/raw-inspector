<script setup lang="ts">
import { computed } from 'vue'
import type { CameraMetadata } from '../workers/libraw-protocol'

const props = defineProps<{ metadata: CameraMetadata | null }>()

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(4))

const rows = computed<[string, string][]>(() => {
  const m = props.metadata
  if (!m) return []
  return [
    ['Camera', `${m.make} ${m.model}`.trim()],
    ['Sensor (raw frame)', `${m.rawWidth} × ${m.rawHeight}`],
    ['Active area', `${m.activeWidth} × ${m.activeHeight}`],
    [
      'Black level',
      `${m.blackLevel} (per channel ${m.blackLevels.join(', ')})`,
    ],
    ['White level', `${m.whiteLevel} (data max ${m.dataMaximum})`],
    [
      'CFA pattern',
      m.cfaLayout ? `${m.cfaPattern} — 2×2: ${m.cfaLayout}` : m.cfaPattern,
    ],
    ['As-shot WB multipliers', m.camMul.map(fmt).join(', ')],
    ['LibRaw', m.libraw],
  ]
})
</script>

<template>
  <div class="camera" data-testid="camera-panel">
    <p v-if="!metadata" class="muted">
      Decode the RAW to see LibRaw's camera and colour data.
    </p>
    <template v-else>
      <dl>
        <template v-for="[label, value] in rows" :key="label">
          <dt>{{ label }}</dt>
          <dd>{{ value }}</dd>
        </template>
      </dl>
      <h3>Colour matrix (camera → XYZ)</h3>
      <table class="matrix">
        <tr v-for="(row, i) in metadata.camXyz" :key="i">
          <td v-for="(v, j) in row" :key="j">{{ fmt(v) }}</td>
        </tr>
      </table>
    </template>
  </div>
</template>

<style scoped>
dl {
  display: grid;
  grid-template-columns: max-content 1fr;
  gap: 4px 16px;
  margin: 0;
}
dt {
  color: var(--text);
}
dd {
  margin: 0;
  color: var(--text-h);
  overflow-wrap: anywhere;
}
h3 {
  font-size: 0.9rem;
  margin: 12px 0 4px;
}
.matrix {
  font-family: monospace;
  border-spacing: 12px 2px;
}
.muted {
  color: var(--text);
}
</style>
