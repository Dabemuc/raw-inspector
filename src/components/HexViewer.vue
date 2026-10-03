<script setup lang="ts">
import { computed, nextTick, ref, shallowRef, watch } from 'vue'
import { hex } from '../core/binary'
import { findSmallestNodeAt } from '../core/model'
import type { RegionKind } from '../core/model'
import type { RandomAccessReader } from '../core/io'
import { useSelection } from '../composables/useSelection'

const props = withDefaults(
  defineProps<{ reader: RandomAccessReader; viewportHeight?: number }>(),
  { viewportHeight: 400 },
)

const BYTES_PER_ROW = 16
const ROW_HEIGHT = 20
const OVERSCAN = 4

const {
  parseResult,
  hoveredNodeId,
  highlightRange,
  hoverNode,
  selectOffset,
  selectRange,
} = useSelection()

const scroller = ref<HTMLElement | null>(null)
const scrollTop = ref(0)
const height = ref(props.viewportHeight)
const gotoText = ref('')
const gotoError = ref(false)
const anchor = ref<number | null>(null)
const bytes = shallowRef<{ start: number; data: Uint8Array }>({
  start: 0,
  data: new Uint8Array(0),
})
const interpretBytes = shallowRef<Uint8Array>(new Uint8Array(0))

const totalRows = computed(() => Math.ceil(props.reader.size / BYTES_PER_ROW))
const firstRow = computed(() =>
  Math.max(0, Math.floor(scrollTop.value / ROW_HEIGHT) - OVERSCAN),
)
const lastRow = computed(() =>
  Math.min(
    totalRows.value,
    Math.ceil((scrollTop.value + height.value) / ROW_HEIGHT) + OVERSCAN,
  ),
)

const rowIndexes = computed(() =>
  Array.from(
    { length: Math.max(0, lastRow.value - firstRow.value) },
    (_, i) => firstRow.value + i,
  ),
)

// Fetch only the visible window; stale replies are dropped.
let fetchId = 0
watch(
  [firstRow, lastRow, () => props.reader],
  async () => {
    const id = ++fetchId
    const start = firstRow.value * BYTES_PER_ROW
    const end = Math.min(lastRow.value * BYTES_PER_ROW, props.reader.size)
    if (end <= start) {
      bytes.value = { start, data: new Uint8Array(0) }
      return
    }
    const data = await props.reader.read(start, end - start)
    if (id === fetchId) bytes.value = { start, data }
  },
  { immediate: true },
)

const windowRegions = computed(() => {
  const lo = firstRow.value * BYTES_PER_ROW
  const hi = lastRow.value * BYTES_PER_ROW
  return (parseResult.value?.regions ?? [])
    .filter((r) => r.offset < hi && r.offset + r.length > lo)
    .sort((a, b) => b.length - a.length)
})

function kindAt(offset: number): RegionKind | null {
  let kind: RegionKind | null = null
  for (const r of windowRegions.value) {
    if (offset >= r.offset && offset < r.offset + r.length) kind = r.kind
  }
  return kind
}

const hoverRange = computed(() => {
  const id = hoveredNodeId.value
  const node = id !== null ? parseResult.value?.nodes[id] : null
  return node ? { offset: node.offset, length: node.length } : null
})

function inRange(
  range: { offset: number; length: number } | null,
  offset: number,
): boolean {
  return (
    !!range && offset >= range.offset && offset < range.offset + range.length
  )
}

interface Cell {
  offset: number
  hex: string
  ascii: string
  kind: RegionKind | null
  selected: boolean
  hovered: boolean
}

const rows = computed(() => {
  const { start, data } = bytes.value
  return rowIndexes.value.map((row) => {
    const rowOffset = row * BYTES_PER_ROW
    const cells: Cell[] = []
    for (let i = 0; i < BYTES_PER_ROW; i++) {
      const offset = rowOffset + i
      const b = data[offset - start]
      if (b === undefined) break
      cells.push({
        offset,
        hex: hex(b),
        ascii: b >= 0x20 && b < 0x7f ? String.fromCharCode(b) : '.',
        kind: kindAt(offset),
        selected: inRange(highlightRange.value, offset),
        hovered: inRange(hoverRange.value, offset),
      })
    }
    return { row, offset: rowOffset, cells }
  })
})

function onScroll() {
  scrollTop.value = scroller.value?.scrollTop ?? 0
  if (scroller.value?.clientHeight) height.value = scroller.value.clientHeight
}

function scrollToOffset(offset: number) {
  const row = Math.floor(offset / BYTES_PER_ROW)
  const top = row * ROW_HEIGHT
  const visibleTop = scrollTop.value
  const visibleBottom = visibleTop + height.value - ROW_HEIGHT
  if (top >= visibleTop && top <= visibleBottom) return
  const target = Math.max(0, top - ROW_HEIGHT)
  scrollTop.value = target
  if (scroller.value) scroller.value.scrollTop = target
}

// Selections that originate inside the viewer must not re-scroll it.
let internal = false
function internally(fn: () => void) {
  internal = true
  fn()
  void nextTick(() => {
    internal = false
  })
}

watch(highlightRange, (range) => {
  if (range && !internal) scrollToOffset(range.offset)
})

function onCellClick(offset: number, event: MouseEvent) {
  internally(() => {
    if (event.shiftKey && anchor.value !== null) {
      const from = Math.min(anchor.value, offset)
      selectRange(from, Math.abs(offset - anchor.value) + 1)
    } else {
      anchor.value = offset
      selectOffset(offset)
    }
  })
}

function onCellHover(offset: number | null) {
  const result = parseResult.value
  const node =
    offset !== null && result ? findSmallestNodeAt(result, offset) : null
  hoverNode(node ? node.id : null)
}

function parseOffset(text: string): number | null {
  const t = text.trim()
  if (/^0x[0-9a-f]+$/i.test(t)) return parseInt(t.slice(2), 16)
  if (/^\d+$/.test(t)) return parseInt(t, 10)
  return null
}

function goTo() {
  const offset = parseOffset(gotoText.value)
  gotoError.value = offset === null || offset >= props.reader.size
  if (gotoError.value || offset === null) return
  anchor.value = offset
  internally(() => {
    selectOffset(offset)
    scrollToOffset(offset)
  })
}

// Value interpretations of the first bytes of the selection.
watch(
  highlightRange,
  async (range) => {
    if (!range || range.length <= 0) {
      interpretBytes.value = new Uint8Array(0)
      return
    }
    const n = Math.min(4, range.length, props.reader.size - range.offset)
    const data =
      n > 0 ? await props.reader.read(range.offset, n) : new Uint8Array(0)
    if (highlightRange.value === range) interpretBytes.value = data
  },
  { immediate: true },
)

const interpretations = computed(() => {
  const d = interpretBytes.value
  const view = new DataView(d.buffer, d.byteOffset, d.byteLength)
  const out: { label: string; value: number }[] = []
  if (d.length >= 2) {
    out.push({ label: 'u16 LE', value: view.getUint16(0, true) })
    out.push({ label: 'u16 BE', value: view.getUint16(0, false) })
  }
  if (d.length >= 4) {
    out.push({ label: 'u32 LE', value: view.getUint32(0, true) })
    out.push({ label: 'u32 BE', value: view.getUint32(0, false) })
  }
  return out
})

const isRange = computed(
  () => !!highlightRange.value && highlightRange.value.length > 1,
)
</script>

<template>
  <section class="hex" data-testid="hex-viewer">
    <form class="goto" @submit.prevent="goTo">
      <input
        v-model="gotoText"
        type="text"
        placeholder="Go to offset (0x1A2B or decimal)"
        aria-label="Go to offset"
        data-testid="goto-input"
        :aria-invalid="gotoError"
      />
      <button type="submit" data-testid="goto-button">Go</button>
    </form>
    <div
      ref="scroller"
      class="scroller"
      data-testid="hex-scroller"
      :style="{ height: `${height}px` }"
      @scroll="onScroll"
      @mouseleave="onCellHover(null)"
    >
      <div class="spacer" :style="{ height: `${totalRows * ROW_HEIGHT}px` }">
        <div
          v-for="r in rows"
          :key="r.row"
          class="row"
          data-testid="hex-row"
          :style="{ top: `${r.row * ROW_HEIGHT}px`, height: `${ROW_HEIGHT}px` }"
        >
          <span class="off">{{ hex(r.offset, 8) }}</span>
          <span class="bytes">
            <span
              v-for="c in r.cells"
              :key="c.offset"
              class="byte"
              :class="[
                c.kind ? `k-${c.kind}` : '',
                { selected: c.selected, hovered: c.hovered },
              ]"
              data-testid="hex-byte"
              :data-offset="c.offset"
              @click="onCellClick(c.offset, $event)"
              @mouseenter="onCellHover(c.offset)"
              >{{ c.hex }}</span
            >
          </span>
          <span class="ascii">
            <span
              v-for="c in r.cells"
              :key="c.offset"
              :class="{ selected: c.selected, hovered: c.hovered }"
              @click="onCellClick(c.offset, $event)"
              >{{ c.ascii }}</span
            >
          </span>
        </div>
      </div>
    </div>
    <p v-if="highlightRange" class="info" data-testid="hex-info">
      <span data-testid="hex-selection"
        >Offset 0x{{ highlightRange.offset.toString(16).toUpperCase() }}</span
      >
      <span v-if="isRange" data-testid="hex-length">
        · {{ highlightRange.length }} bytes</span
      >
      <span
        v-for="i in interpretations"
        :key="i.label"
        class="interp"
        data-testid="hex-interp"
      >
        {{ i.label }}: {{ i.value }}
      </span>
    </p>
  </section>
</template>

<style scoped>
.hex {
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 8px;
  background: var(--panel-bg);
  min-width: 0;
}
.goto {
  display: flex;
  gap: 4px;
  margin-bottom: 8px;
}
.goto input {
  flex: 1;
  min-width: 0;
}
.goto input[aria-invalid='true'] {
  border-color: #d33;
}
.scroller {
  overflow: auto;
  font-family: var(--mono);
  font-size: 13px;
}
.spacer {
  position: relative;
  min-width: max-content;
}
.row {
  position: absolute;
  left: 0;
  right: 0;
  display: flex;
  gap: 12px;
  line-height: 20px;
  white-space: pre;
}
.off {
  color: var(--text);
}
.bytes {
  display: flex;
  gap: 4px;
}
.byte {
  cursor: pointer;
  border-radius: 2px;
}
.ascii span {
  cursor: pointer;
}
.k-header {
  background: rgba(60, 130, 255, 0.15);
}
.k-ifd {
  background: rgba(60, 180, 90, 0.15);
}
.k-value {
  background: rgba(240, 180, 40, 0.15);
}
.k-raw-data {
  background: rgba(150, 150, 150, 0.15);
}
.k-preview,
.k-thumbnail {
  background: rgba(220, 80, 200, 0.15);
}
.k-makernote {
  background: rgba(240, 120, 60, 0.15);
}
.k-unknown {
  background: rgba(220, 60, 60, 0.15);
}
.hovered {
  outline: 1px solid var(--accent-border);
  background: var(--accent-bg);
}
.selected {
  background: var(--accent);
  color: #fff;
}
.info {
  margin: 8px 0 0;
  font-family: var(--mono);
  font-size: 12px;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
</style>
