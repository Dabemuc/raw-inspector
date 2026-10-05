<script setup lang="ts">
import { computed } from 'vue'
import type { KeyFact } from '../metadata/keyFacts'

const props = defineProps<{
  facts: KeyFact[]
  loading: boolean
}>()

const showSkeleton = computed(() => props.loading && props.facts.length === 0)
</script>

<template>
  <section class="card" data-testid="key-facts">
    <h2>Key facts</h2>
    <div v-if="showSkeleton" class="skeleton" data-testid="key-facts-skeleton">
      <span v-for="n in 6" :key="n" class="bar" />
    </div>
    <dl v-else-if="facts.length > 0">
      <template v-for="f in facts" :key="f.id">
        <dt>{{ f.label }}</dt>
        <dd :data-testid="`fact-${f.id}`">
          {{ f.value }}
          <a
            v-if="f.href"
            :href="f.href"
            target="_blank"
            rel="noopener noreferrer"
            >{{ f.linkLabel ?? 'Open' }}</a
          >
        </dd>
      </template>
    </dl>
    <p v-else class="muted">No key facts found.</p>
  </section>
</template>

<style scoped>
.card {
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 12px 16px;
  background: var(--panel-bg);
}
h2 {
  font-size: 1rem;
  margin: 0 0 8px;
}
dl {
  display: grid;
  grid-template-columns: max-content minmax(0, 1fr);
  gap: 4px 12px;
  margin: 0;
}
dt {
  color: var(--text);
  opacity: 0.7;
}
dd {
  margin: 0;
  overflow-wrap: anywhere;
}
dd a {
  margin-left: 6px;
}
.skeleton {
  display: grid;
  gap: 8px;
}
.bar {
  height: 14px;
  border-radius: 4px;
  background: var(--border);
  opacity: 0.6;
}
</style>
