<script setup lang="ts">
import { computed } from 'vue'
import { collectIssues } from '../core/model'
import type { Issue, ParseResult } from '../core/model'
import { useSelection } from '../composables/useSelection'

const props = defineProps<{ result: ParseResult }>()
defineEmits<{ close: [] }>()

const { selectNode } = useSelection()

const issues = computed(() => collectIssues(props.result))
const groups = computed(() => [
  {
    severity: 'broken',
    title: 'Broken',
    items: issues.value.filter((i) => i.severity === 'broken'),
  },
  {
    severity: 'warning',
    title: 'Warnings',
    items: issues.value.filter((i) => i.severity === 'warning'),
  },
])

function label(issue: Issue): string {
  return issue.nodeId ? (props.result.nodes[issue.nodeId]?.label ?? '') : 'File'
}
</script>

<template>
  <section class="warnings" data-testid="warnings-panel">
    <header>
      <h2>Problems ({{ issues.length }})</h2>
      <button
        type="button"
        data-testid="warnings-close"
        @click="$emit('close')"
      >
        Close
      </button>
    </header>
    <p v-if="!issues.length" data-testid="warnings-empty">No problems found.</p>
    <template v-for="g in groups" :key="g.severity">
      <div v-if="g.items.length" :data-testid="`warnings-group-${g.severity}`">
        <h3>{{ g.title }} ({{ g.items.length }})</h3>
        <ul>
          <li v-for="(issue, i) in g.items" :key="i">
            <button
              v-if="issue.nodeId"
              type="button"
              class="link"
              data-testid="warning-item"
              @click="selectNode(issue.nodeId)"
            >
              <strong>{{ label(issue) }}</strong> — {{ issue.message }}
            </button>
            <span v-else data-testid="warning-item">{{ issue.message }}</span>
          </li>
        </ul>
      </div>
    </template>
  </section>
</template>

<style scoped>
.warnings {
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 12px 16px;
  margin: 12px 12px 0;
  background: var(--panel-bg);
}
header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
h2,
h3 {
  font-size: 1rem;
  margin: 0 0 8px;
}
ul {
  margin: 0 0 8px;
  padding-left: 0;
  list-style: none;
}
.link {
  text-align: left;
  background: none;
  border: none;
  padding: 2px 0;
  cursor: pointer;
  color: inherit;
}
</style>
