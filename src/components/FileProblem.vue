<script setup lang="ts">
import { computed } from 'vue'
import type { FileProblem } from '../core/model'

const props = defineProps<{
  problem: FileProblem | 'read-error' | 'worker-crash'
  detail?: string | null
  formatName?: string | null
  /** Whether the hex viewer and byte map are still available. */
  hasResult?: boolean
}>()
defineEmits<{ open: [] }>()

const content = computed(() => {
  switch (props.problem) {
    case 'empty':
      return {
        title: 'This file is empty',
        body: 'The file contains 0 bytes, so there is nothing to inspect.',
      }
    case 'too-small':
      return {
        title: 'This file is too small',
        body: 'It is smaller than a TIFF header (8 bytes), so it cannot be a RAW file.',
      }
    case 'unsupported':
      return {
        title: 'Unsupported format',
        body: `Detected format: ${props.formatName ?? 'unknown'}. Only TIFF-based RAW files (DNG, ARW, NEF, CR2, ORF, RW2) can be parsed into a structure tree.`,
      }
    case 'read-error':
      return {
        title: 'Could not read the file',
        body: 'The browser failed to read this file. It may have been moved, deleted or be unreadable.',
      }
    default:
      return {
        title: 'The parser crashed',
        body: 'The background worker stopped unexpectedly while parsing this file.',
      }
  }
})
</script>

<template>
  <div class="problem" role="alert" :data-testid="`problem-${problem}`">
    <h2>{{ content.title }}</h2>
    <p data-testid="problem-body">{{ content.body }}</p>
    <p v-if="detail" class="detail" data-testid="problem-detail">
      {{ detail }}
    </p>
    <p v-if="hasResult" data-testid="problem-shown">
      The hex viewer and byte map are still available below.
    </p>
    <button type="button" data-testid="problem-open" @click="$emit('open')">
      Open another file
    </button>
  </div>
</template>

<style scoped>
.problem {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 24px 16px;
  text-align: center;
}
.detail {
  font-family: monospace;
  color: var(--text);
}
</style>
