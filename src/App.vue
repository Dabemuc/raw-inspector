<script setup lang="ts">
import HelloWorld from './components/HelloWorld.vue'
import { useStructureParser } from './composables/useStructureParser'

const parser = useStructureParser()

function onFile(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (file) parser.parse(file)
}
</script>

<template>
  <HelloWorld />
  <input type="file" @change="onFile" />
  <p>Parser: {{ parser.status.value }}</p>
</template>
