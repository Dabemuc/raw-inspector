<script setup lang="ts">
defineProps<{ title: string }>()
</script>

<template>
  <section class="panel">
    <h2>{{ title }}</h2>
    <slot>
      <p class="muted">Coming soon.</p>
    </slot>
  </section>
</template>

<style scoped>
.panel {
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 12px 16px;
  min-height: 80px;
  background: var(--panel-bg);
}
h2 {
  font-size: 1rem;
  margin: 0 0 8px;
}
.muted {
  color: var(--text);
}
</style>
