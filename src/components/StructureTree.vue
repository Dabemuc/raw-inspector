<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useSelection } from '../composables/useSelection'
import type { StructureNode } from '../core/model'

const ROW_HEIGHT = 24
const OVERSCAN = 8
const FALLBACK_VIEWPORT = 480

const TYPE_NAMES: Record<number, string> = {
  1: 'BYTE',
  2: 'ASCII',
  3: 'SHORT',
  4: 'LONG',
  5: 'RATIONAL',
  6: 'SBYTE',
  7: 'UNDEFINED',
  8: 'SSHORT',
  9: 'SLONG',
  10: 'SRATIONAL',
  11: 'FLOAT',
  12: 'DOUBLE',
  13: 'IFD',
  16: 'LONG8',
  17: 'SLONG8',
  18: 'IFD8',
}

interface Row {
  node: StructureNode
  depth: number
  expandable: boolean
  expanded: boolean
}

const { parseResult, selectedNodeId, selectedPath, selectNode, hoverNode } =
  useSelection()

const expanded = ref(new Set<string>())
const query = ref('')
const hexOffsets = ref(true)
const scrollTop = ref(0)
const viewportHeight = ref(0)
const scroller = ref<HTMLElement | null>(null)

function setExpanded(id: string, on: boolean) {
  const next = new Set(expanded.value)
  if (on) next.add(id)
  else next.delete(id)
  expanded.value = next
}

watch(
  parseResult,
  (result) => {
    expanded.value = new Set(result ? [result.rootId] : [])
    scrollTop.value = 0
    if (scroller.value) scroller.value.scrollTop = 0
  },
  { immediate: true },
)

/** Ids of nodes that have a warning/broken descendant. */
const problemParents = computed(() => {
  const result = parseResult.value
  const out = new Set<string>()
  if (!result) return out
  const visit = (id: string): boolean => {
    const node = result.nodes[id]
    if (!node) return false
    let any = false
    for (const c of node.childIds) if (visit(c)) any = true
    if (any) out.add(id)
    return any || node.status !== 'ok'
  }
  visit(result.rootId)
  return out
})

function matches(node: StructureNode, q: string, num: number | null): boolean {
  if (node.label.toLowerCase().includes(q)) return true
  const d = node.details
  if (!d) return false
  if (num !== null && typeof d.tagId === 'number' && d.tagId === num) {
    return true
  }
  const v = d.value
  return v !== undefined && v !== null && String(v).toLowerCase().includes(q)
}

/** With a query: ids to show (matches plus their ancestors); else null. */
const visibleIds = computed<Set<string> | null>(() => {
  const result = parseResult.value
  const q = query.value.trim().toLowerCase()
  if (!result || !q) return null
  const num = /^(0x[0-9a-f]+|\d+)$/.test(q) ? Number(q) : null
  const keep = new Set<string>()
  const visit = (id: string): boolean => {
    const node = result.nodes[id]
    if (!node) return false
    let any = matches(node, q, num)
    for (const c of node.childIds) if (visit(c)) any = true
    if (any) keep.add(id)
    return any
  }
  visit(result.rootId)
  return keep
})

const rows = computed<Row[]>(() => {
  const result = parseResult.value
  if (!result) return []
  const keep = visibleIds.value
  const out: Row[] = []
  const walk = (id: string, depth: number) => {
    const node = result.nodes[id]
    if (!node || (keep && !keep.has(id))) return
    const kids = keep ? node.childIds.filter((c) => keep.has(c)) : node.childIds
    const expandable = kids.length > 0
    const open = expandable && (keep ? true : expanded.value.has(id))
    out.push({ node, depth, expandable, expanded: open })
    if (open) for (const c of kids) walk(c, depth + 1)
  }
  walk(result.rootId, 0)
  return out
})

const range = computed(() => {
  const height = viewportHeight.value || FALLBACK_VIEWPORT
  const start = Math.max(0, Math.floor(scrollTop.value / ROW_HEIGHT) - OVERSCAN)
  const end = Math.min(
    rows.value.length,
    Math.ceil((scrollTop.value + height) / ROW_HEIGHT) + OVERSCAN,
  )
  return { start, end }
})

const windowed = computed(() =>
  rows.value
    .slice(range.value.start, range.value.end)
    .map((row, i) => ({ row, index: range.value.start + i })),
)

function onScroll() {
  const el = scroller.value
  if (!el) return
  scrollTop.value = el.scrollTop
  viewportHeight.value = el.clientHeight
}

function scrollToIndex(index: number) {
  const el = scroller.value
  if (!el || index < 0) return
  const height = el.clientHeight || FALLBACK_VIEWPORT
  const top = index * ROW_HEIGHT
  let next = el.scrollTop
  if (top < next) next = top
  else if (top + ROW_HEIGHT > next + height) next = top + ROW_HEIGHT - height
  el.scrollTop = next
  scrollTop.value = next
}

// External selection changes: expand ancestors and reveal the row.
watch(selectedNodeId, async (id) => {
  if (id === null) return
  const next = new Set(expanded.value)
  for (const n of selectedPath.value) next.add(n.id)
  expanded.value = next
  await nextTick()
  scrollToIndex(rows.value.findIndex((r) => r.node.id === id))
})

function fmtOffset(n: number): string {
  return hexOffsets.value ? '0x' + n.toString(16).toUpperCase() : String(n)
}

function typeCount(node: StructureNode): string {
  const d = node.details
  if (!d || node.kind !== 'entry') return ''
  const t = typeof d.type === 'number' ? (TYPE_NAMES[d.type] ?? d.type) : ''
  const c = d.count !== undefined && d.count !== null ? `×${d.count}` : ''
  return `${t}${c}`
}

function valueSummary(node: StructureNode): string {
  const v = node.details?.value
  return v === undefined || v === null ? '' : String(v)
}

function problemTitle(node: StructureNode): string {
  return node.messages.length ? node.messages.join('\n') : node.status
}

function toggle(row: Row) {
  if (row.expandable) setExpanded(row.node.id, !row.expanded)
}

function onKeydown(event: KeyboardEvent) {
  const list = rows.value
  if (!list.length) return
  const cur = list.findIndex((r) => r.node.id === selectedNodeId.value)
  const row = cur >= 0 ? list[cur] : undefined
  const move = (i: number) => {
    const target = list[Math.max(0, Math.min(list.length - 1, i))]
    if (target) {
      selectNode(target.node.id)
      scrollToIndex(list.indexOf(target))
    }
  }
  switch (event.key) {
    case 'ArrowDown':
      move(cur + 1)
      break
    case 'ArrowUp':
      move(cur < 0 ? 0 : cur - 1)
      break
    case 'ArrowRight':
      if (!row) return
      if (row.expandable && !row.expanded) setExpanded(row.node.id, true)
      else move(cur + 1)
      break
    case 'ArrowLeft': {
      if (!row) return
      if (row.expandable && row.expanded && !visibleIds.value) {
        setExpanded(row.node.id, false)
      } else {
        const pi = list.findIndex((r) => r.node.id === row.node.parentId)
        if (pi >= 0) move(pi)
      }
      break
    }
    case 'Enter':
      if (cur < 0) move(0)
      else selectNode(list[cur]!.node.id)
      break
    default:
      return
  }
  event.preventDefault()
}
</script>

<template>
  <section class="tree" data-testid="structure-tree">
    <header class="bar">
      <h2>Structure</h2>
      <input
        v-model="query"
        type="search"
        placeholder="Search label, tag (0x0100) or value"
        aria-label="Search structure"
        data-testid="tree-search"
      />
      <button
        type="button"
        data-testid="offset-toggle"
        @click="hexOffsets = !hexOffsets"
      >
        {{ hexOffsets ? 'hex' : 'dec' }}
      </button>
    </header>
    <div class="cols head" aria-hidden="true">
      <span>Label</span><span>Offset</span><span>Length</span> <span>Type</span
      ><span>Value</span>
    </div>
    <div
      ref="scroller"
      class="scroller"
      role="tree"
      tabindex="0"
      data-testid="tree-scroller"
      @scroll="onScroll"
      @keydown="onKeydown"
      @mouseleave="hoverNode(null)"
    >
      <p v-if="parseResult && !rows.length" class="muted">No matches.</p>
      <div :style="{ height: rows.length * ROW_HEIGHT + 'px' }" class="spacer">
        <div
          v-for="{ row, index } in windowed"
          :key="row.node.id"
          class="cols row"
          :class="{ selected: row.node.id === selectedNodeId }"
          role="treeitem"
          :aria-selected="row.node.id === selectedNodeId"
          :aria-expanded="row.expandable ? row.expanded : undefined"
          :data-node-id="row.node.id"
          data-testid="tree-row"
          :style="{ top: index * ROW_HEIGHT + 'px', height: ROW_HEIGHT + 'px' }"
          @click="selectNode(row.node.id)"
          @mouseenter="hoverNode(row.node.id)"
        >
          <span class="label" :style="{ paddingLeft: row.depth * 14 + 'px' }">
            <button
              v-if="row.expandable"
              type="button"
              class="twisty"
              data-testid="tree-toggle"
              :aria-label="row.expanded ? 'Collapse' : 'Expand'"
              @click.stop="toggle(row)"
            >
              {{ row.expanded ? '▾' : '▸' }}
            </button>
            <span v-else class="twisty"></span>
            <span
              v-if="row.node.status !== 'ok'"
              class="status"
              :class="row.node.status"
              :title="problemTitle(row.node)"
              data-testid="status-icon"
              >{{ row.node.status === 'broken' ? '✖' : '⚠' }}</span
            >
            <span
              v-else-if="problemParents.has(row.node.id)"
              class="status child"
              title="Contains nodes with problems"
              data-testid="status-aggregate"
              >●</span
            >
            {{ row.node.label }}
          </span>
          <span class="mono">{{ fmtOffset(row.node.offset) }}</span>
          <span class="mono">{{ row.node.length }}</span>
          <span class="mono">{{ typeCount(row.node) }}</span>
          <span class="mono value" :title="valueSummary(row.node)">{{
            valueSummary(row.node)
          }}</span>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.tree {
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 8px;
  background: var(--panel-bg);
  display: flex;
  flex-direction: column;
  min-width: 0;
  font-size: 0.85rem;
}
.bar {
  display: flex;
  gap: 8px;
  align-items: center;
  margin-bottom: 6px;
}
.bar h2 {
  font-size: 1rem;
  margin: 0;
}
.bar input {
  flex: 1;
  min-width: 0;
}
.cols {
  display: grid;
  grid-template-columns: minmax(140px, 2fr) 5.5rem 4rem 7rem minmax(60px, 2fr);
  gap: 8px;
  align-items: center;
}
.head {
  font-weight: 600;
  color: var(--text-h);
  padding: 0 4px;
}
.scroller {
  height: 60vh;
  overflow: auto;
  position: relative;
}
.spacer {
  position: relative;
}
.row {
  position: absolute;
  left: 0;
  right: 0;
  padding: 0 4px;
  box-sizing: border-box;
  cursor: pointer;
  white-space: nowrap;
}
.row:hover {
  background: var(--code-bg);
}
.row.selected {
  background: var(--accent-bg);
  outline: 1px solid var(--accent-border);
}
.row > span {
  overflow: hidden;
  text-overflow: ellipsis;
}
.mono {
  font-family: var(--mono);
}
.twisty {
  display: inline-block;
  width: 1.2em;
  padding: 0;
  border: 0;
  background: none;
  color: inherit;
  cursor: pointer;
}
.status.warning {
  color: #d97706;
}
.status.broken {
  color: #dc2626;
}
.status.child {
  color: #d97706;
  font-size: 0.6em;
  vertical-align: middle;
}
.muted {
  color: var(--text);
  padding: 4px;
}
</style>
