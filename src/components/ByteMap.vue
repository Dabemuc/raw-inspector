<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useSelection } from '../composables/useSelection'
import { coverageStats } from '../parsers/coverage'
import type { RegionKind } from '../core/model'
import {
  fullWindow,
  layoutSegments,
  panWindow,
  zoomWindow,
  type ByteWindow,
  type Segment,
} from './byteMapLayout'

const WIDTH = 1000
const HEIGHT = 48
const NESTED_INSET = 8

const KIND_LABELS: Record<RegionKind, string> = {
  header: 'Header',
  ifd: 'IFD',
  value: 'Values',
  'raw-data': 'Raw sensor data',
  preview: 'Preview',
  thumbnail: 'Thumbnail',
  makernote: 'MakerNote',
  unknown: 'Unknown',
}

const { parseResult, selectedNodeId, hoveredNodeId, selectNode, hoverNode } =
  useSelection()

const fileSize = computed(() => parseResult.value?.fileSize ?? 0)
const win = ref<ByteWindow>(fullWindow(fileSize.value))
watch(fileSize, (s) => (win.value = fullWindow(s)))

const zoomed = computed(() => win.value.end - win.value.start < fileSize.value)

const segments = computed<Segment[]>(() =>
  parseResult.value
    ? layoutSegments(parseResult.value.regions, win.value, WIDTH, {
        showNested: zoomed.value,
      })
    : [],
)

const stats = computed(() =>
  parseResult.value ? coverageStats(parseResult.value) : null,
)
const legend = computed(() =>
  stats.value
    ? (Object.keys(KIND_LABELS) as RegionKind[])
        .filter((k) => stats.value![k].bytes > 0)
        .map((k) => ({
          kind: k,
          label: KIND_LABELS[k],
          bytes: stats.value![k].bytes,
          percent: stats.value![k].percent,
        }))
    : [],
)

const tooltip = computed(() => {
  const id = hoveredNodeId.value
  const seg = segments.value.find((s) => s.nodeId === id)
  const node = id ? parseResult.value?.nodes[id] : null
  if (!seg || !node) return null
  return {
    label: node.label,
    kind: KIND_LABELS[seg.kind],
    offset: seg.offset,
    length: seg.length,
    left: Math.min(90, Math.max(0, ((seg.x + seg.width / 2) / WIDTH) * 100)),
  }
})

function segY(s: Segment): number {
  return Math.min(s.depth, 3) * (NESTED_INSET / 2)
}

function onWheel(event: WheelEvent) {
  const el = event.currentTarget as Element
  const rect = el.getBoundingClientRect()
  const anchor = rect.width > 0 ? (event.clientX - rect.left) / rect.width : 0.5
  const factor = Math.exp(-event.deltaY * 0.0025)
  win.value = zoomWindow(
    win.value,
    fileSize.value,
    factor,
    Math.min(1, Math.max(0, anchor)),
  )
}

let drag: { x: number; start: ByteWindow; moved: boolean } | null = null
let suppressClick = false

function onPointerDown(event: PointerEvent) {
  if (!zoomed.value) return
  drag = { x: event.clientX, start: win.value, moved: false }
  ;(event.currentTarget as Element).setPointerCapture?.(event.pointerId)
}
function onPointerMove(event: PointerEvent) {
  if (!drag) return
  const rect = (event.currentTarget as Element).getBoundingClientRect()
  if (rect.width <= 0) return
  const dx = event.clientX - drag.x
  if (Math.abs(dx) > 3) drag.moved = true
  const span = drag.start.end - drag.start.start
  win.value = panWindow(drag.start, fileSize.value, (-dx / rect.width) * span)
}
function onPointerUp() {
  suppressClick = drag?.moved ?? false
  drag = null
}
function onClick(id: string) {
  if (suppressClick) {
    suppressClick = false
    return
  }
  selectNode(id)
}

function zoomBy(factor: number) {
  win.value = zoomWindow(win.value, fileSize.value, factor)
}
function reset() {
  win.value = fullWindow(fileSize.value)
}
</script>

<template>
  <section class="bytemap" data-testid="byte-map">
    <header>
      <h2>Byte map</h2>
      <div class="controls">
        <button type="button" aria-label="Zoom in" @click="zoomBy(2)">+</button>
        <button type="button" aria-label="Zoom out" @click="zoomBy(0.5)">
          −
        </button>
        <button
          type="button"
          data-testid="map-reset"
          :disabled="!zoomed"
          @click="reset"
        >
          Reset
        </button>
      </div>
    </header>
    <div class="bar">
      <svg
        :viewBox="`0 0 ${WIDTH} ${HEIGHT}`"
        preserveAspectRatio="none"
        role="img"
        aria-label="Byte map of the whole file"
        :class="{ pannable: zoomed }"
        @wheel.prevent="onWheel"
        @pointerdown="onPointerDown"
        @pointermove="onPointerMove"
        @pointerup="onPointerUp"
        @pointercancel="onPointerUp"
        @pointerleave="hoverNode(null)"
      >
        <rect
          v-for="s in segments"
          :key="`${s.nodeId}:${s.offset}`"
          data-testid="map-segment"
          :data-node-id="s.nodeId"
          :class="[
            'seg',
            `kind-${s.kind}`,
            {
              selected: s.nodeId === selectedNodeId,
              hovered: s.nodeId === hoveredNodeId,
            },
          ]"
          :x="s.x"
          :y="segY(s)"
          :width="s.width"
          :height="HEIGHT - segY(s) * 2"
          @click="onClick(s.nodeId)"
          @pointerenter="hoverNode(s.nodeId)"
        />
      </svg>
      <div
        v-if="tooltip"
        class="tooltip"
        data-testid="map-tooltip"
        :style="{ left: `${tooltip.left}%` }"
      >
        <strong>{{ tooltip.label }}</strong> · {{ tooltip.kind }}<br />
        offset {{ tooltip.offset }} · {{ tooltip.length }} B
      </div>
    </div>
    <ul class="legend" data-testid="map-legend">
      <li v-for="l in legend" :key="l.kind">
        <span :class="['swatch', `kind-${l.kind}`]"></span>
        {{ l.label }}: {{ l.bytes.toLocaleString('en-US') }} B ({{
          l.percent.toFixed(1)
        }}%)
      </li>
    </ul>
  </section>
</template>

<style scoped>
.bytemap {
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 12px 16px;
  background: var(--panel-bg);
}
header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
h2 {
  font-size: 1rem;
  margin: 0 0 8px;
}
.controls {
  display: flex;
  gap: 4px;
}
.bar {
  position: relative;
}
svg {
  display: block;
  width: 100%;
  height: 48px;
  background: var(--code-bg);
  border-radius: 4px;
  touch-action: none;
}
svg.pannable {
  cursor: grab;
}
.seg {
  cursor: pointer;
  stroke: var(--panel-bg);
  stroke-width: 1;
  vector-effect: non-scaling-stroke;
}
.seg.hovered,
.seg.selected {
  stroke: var(--text-h);
  stroke-width: 2;
}
.seg.selected {
  stroke-dasharray: 4 2;
}
.tooltip {
  position: absolute;
  top: 100%;
  transform: translateX(-50%);
  margin-top: 4px;
  z-index: 2;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 0.75rem;
  white-space: nowrap;
  pointer-events: none;
  color: var(--text-h);
  background: var(--panel-bg);
  border: 1px solid var(--border);
  box-shadow: var(--shadow);
}
.legend {
  list-style: none;
  display: flex;
  flex-wrap: wrap;
  gap: 4px 16px;
  padding: 0;
  margin: 8px 0 0;
  font-size: 0.8rem;
}
.swatch {
  display: inline-block;
  width: 10px;
  height: 10px;
  border-radius: 2px;
  border: 1px solid var(--text-h);
}
/* Okabe-Ito based: distinguishable under common colour-vision deficiencies. */
.kind-header {
  fill: #0072b2;
  background: #0072b2;
}
.kind-ifd {
  fill: #e69f00;
  background: #e69f00;
}
.kind-value {
  fill: #56b4e9;
  background: #56b4e9;
}
.kind-raw-data {
  fill: #009e73;
  background: #009e73;
}
.kind-preview {
  fill: #cc79a7;
  background: #cc79a7;
}
.kind-thumbnail {
  fill: #f0e442;
  background: #f0e442;
}
.kind-makernote {
  fill: #d55e00;
  background: #d55e00;
}
.kind-unknown {
  fill: #8a8a8a;
  background: #8a8a8a;
}
</style>
