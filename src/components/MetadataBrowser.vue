<script setup lang="ts">
import { computed, ref } from 'vue'
import type { MetadataStatus } from '../composables/useMetadata'
import {
  countTags,
  downloadText,
  exportFileName,
  filterGroups,
  orderGroups,
  rawText,
  toCsv,
  toJson,
} from '../metadata/browse'
import { findTagNode } from '../metadata/tagIndex'
import type { TagIndex } from '../metadata/tagIndex'
import type { MetadataGroup, MetadataTag } from '../metadata/types'
import type { MetadataResult } from '../metadata/types'

const props = defineProps<{
  result: MetadataResult | null
  status: MetadataStatus
  fileName: string
  /** Index of the structure tree's entries; enables "Show in file". */
  tagIndex?: TagIndex | null
}>()

const emit = defineEmits<{
  'show-in-file': [nodeId: string]
}>()

const TRUNCATE_AT = 200
const DEFAULT_OPEN = new Set(['EXIF'])

const query = ref('')
const showRaw = ref(false)
const showIds = ref(false)
/** Manual overrides of the default open state, by group id. */
const toggled = ref<Record<string, boolean>>({})
const expanded = ref(new Set<string>())
const copied = ref('')

const searching = computed(() => query.value.trim() !== '')
const ordered = computed(() => orderGroups(props.result?.groups ?? []))
const visible = computed(() => filterGroups(ordered.value, query.value))
const total = computed(() => countTags(visible.value))

const source = computed(() => {
  const r = props.result
  if (!r) return ''
  if (r.source === 'engine') return `from ${r.engine ?? 'engine'}`
  return props.status === 'loading'
    ? 'from file structure (engine still running)'
    : 'from file structure'
})

function isOpen(g: MetadataGroup): boolean {
  if (searching.value) return true
  return toggled.value[g.id] ?? DEFAULT_OPEN.has(g.family)
}

function toggle(g: MetadataGroup) {
  toggled.value = { ...toggled.value, [g.id]: !isOpen(g) }
}

function label(tag: MetadataTag): string {
  return tag.description || tag.name
}

function shown(tag: MetadataTag): string {
  if (!showRaw.value) return tag.value
  return tag.raw === undefined ? tag.value : rawText(tag)
}

function nodeOf(g: MetadataGroup, tag: MetadataTag): string | null {
  return props.tagIndex ? findTagNode(props.tagIndex, g.name, tag) : null
}

function rowKey(g: MetadataGroup, i: number): string {
  return `${g.id}#${i}`
}

function isLong(text: string): boolean {
  return text.length > TRUNCATE_AT
}

function display(key: string, text: string): string {
  return isLong(text) && !expanded.value.has(key)
    ? text.slice(0, TRUNCATE_AT) + '…'
    : text
}

function expand(key: string) {
  expanded.value = new Set(expanded.value).add(key)
}

async function copy(key: string, text: string) {
  try {
    await navigator.clipboard.writeText(text)
    copied.value = key
  } catch {
    copied.value = ''
  }
}

function exportAs(ext: 'json' | 'csv') {
  if (!props.result) return
  const isJson = ext === 'json'
  downloadText(
    exportFileName(props.fileName, ext),
    isJson ? toJson(props.result) : toCsv(props.result),
    isJson ? 'application/json' : 'text/csv',
  )
}
</script>

<template>
  <div class="browser" data-testid="metadata-browser">
    <p v-if="!result" class="muted" data-testid="metadata-empty">
      {{ status === 'loading' ? 'Reading metadata…' : 'No metadata.' }}
    </p>
    <template v-else>
      <div class="bar">
        <input
          v-model="query"
          type="search"
          placeholder="Search tags, descriptions, values"
          aria-label="Search metadata"
          data-testid="metadata-search"
        />
        <label
          ><input v-model="showRaw" type="checkbox" data-testid="toggle-raw" />
          Raw values</label
        >
        <label
          ><input v-model="showIds" type="checkbox" data-testid="toggle-ids" />
          Tag ids &amp; names</label
        >
        <button
          type="button"
          data-testid="export-json"
          @click="exportAs('json')"
        >
          JSON
        </button>
        <button type="button" data-testid="export-csv" @click="exportAs('csv')">
          CSV
        </button>
      </div>
      <p class="meta">
        <span data-testid="metadata-source">{{ source }}</span>
        <span v-if="status === 'loading'" data-testid="metadata-reading">
          · Reading metadata…
        </span>
        <span v-if="searching" data-testid="metadata-count">
          · {{ total }} {{ total === 1 ? 'match' : 'matches' }}
        </span>
      </p>
      <section
        v-for="g in visible"
        :key="g.id"
        class="group"
        data-testid="metadata-group"
      >
        <button
          type="button"
          class="head"
          :aria-expanded="isOpen(g)"
          data-testid="group-header"
          @click="toggle(g)"
        >
          <span>{{ isOpen(g) ? '▾' : '▸' }} {{ g.name }}</span>
          <span class="count" data-testid="group-count">{{
            g.tags.length
          }}</span>
        </button>
        <table v-if="isOpen(g)">
          <tbody>
            <tr
              v-for="(t, i) in g.tags"
              :key="rowKey(g, i)"
              data-testid="metadata-row"
            >
              <th scope="row">
                {{ label(t) }}
                <small v-if="showIds" class="ids" data-testid="tag-ids">
                  {{ t.name
                  }}<template v-if="t.tagId !== undefined">
                    (0x{{ t.tagId.toString(16) }})</template
                  >
                </small>
              </th>
              <td>
                <span
                  class="value"
                  :title="copied === rowKey(g, i) ? 'Copied' : 'Click to copy'"
                  data-testid="metadata-value"
                  @click="copy(rowKey(g, i), shown(t))"
                  >{{ display(rowKey(g, i), shown(t)) }}</span
                >
                <button
                  v-if="isLong(shown(t)) && !expanded.has(rowKey(g, i))"
                  type="button"
                  class="more"
                  data-testid="show-more"
                  @click="expand(rowKey(g, i))"
                >
                  show more
                </button>
                <button
                  v-if="nodeOf(g, t)"
                  type="button"
                  class="more"
                  data-testid="show-in-file"
                  @click="emit('show-in-file', nodeOf(g, t)!)"
                >
                  Show in file
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </section>
      <p v-if="searching && !visible.length" class="muted">No matches.</p>
    </template>
  </div>
</template>

<style scoped>
.bar {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 12px;
  align-items: center;
  font-size: 0.85rem;
}
.bar input[type='search'] {
  flex: 1 1 200px;
  padding: 4px 8px;
}
.meta,
.muted {
  font-size: 0.8rem;
  margin: 6px 0;
}
.group {
  border-top: 1px solid var(--border);
}
.head {
  display: flex;
  justify-content: space-between;
  width: 100%;
  background: none;
  border: 0;
  padding: 6px 0;
  font: inherit;
  font-weight: 600;
  color: var(--text-h);
  cursor: pointer;
}
.count {
  font-weight: normal;
  color: var(--text);
}
table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.8rem;
}
th {
  text-align: left;
  font-weight: 500;
  width: 35%;
  vertical-align: top;
  padding: 2px 8px 2px 0;
}
td {
  padding: 2px 0;
  word-break: break-word;
  font-family: var(--mono);
}
.ids {
  display: block;
  color: var(--text);
  font-family: var(--mono);
}
.value {
  cursor: copy;
}
.more {
  margin-left: 6px;
  font-size: 0.75rem;
}
</style>
