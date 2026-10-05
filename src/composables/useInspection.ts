import { computed, ref, shallowRef, watch } from 'vue'
import { createFileReader } from '../core/io'
import { useRawDecode } from './useRawDecode'
import { useSelection } from './useSelection'
import { useStructureParser } from './useStructureParser'

export type InspectionMode = 'overview' | 'technical'

/** Anything other than `#technical` falls back to overview. */
export function modeFromHash(hash: string): InspectionMode {
  return hash.replace(/^#/, '') === 'technical' ? 'technical' : 'overview'
}

export function createInspection() {
  const parser = useStructureParser()
  const decoder = useRawDecode()
  const selection = useSelection()

  watch(parser.result, (r) => selection.setParseResult(r), { immediate: true })

  const file = shallowRef<File | null>(null)
  const fileName = computed(() => file.value?.name ?? '')
  const reader = computed(() =>
    file.value ? createFileReader(file.value) : null,
  )

  const hasWindow = typeof window !== 'undefined'
  const mode = ref<InspectionMode>(
    hasWindow ? modeFromHash(window.location.hash) : 'overview',
  )

  /** Switches mode and the URL hash; never re-parses or touches selection. */
  function setMode(next: InspectionMode) {
    mode.value = next
    if (hasWindow && modeFromHash(window.location.hash) !== next) {
      window.location.hash = next
    }
  }

  if (hasWindow) {
    window.addEventListener('hashchange', () => {
      mode.value = modeFromHash(window.location.hash)
    })
  }

  /** Loads a new file, cancelling every running job and resetting state. */
  function load(next: File) {
    decoder.cancel()
    selection.clear()
    file.value = next
    parser.parse(next)
  }

  function reset() {
    decoder.cancel()
    parser.cancel()
    selection.setParseResult(null)
    file.value = null
  }

  return {
    file,
    fileName,
    reader,
    mode,
    setMode,
    load,
    reset,
    parser,
    decoder,
    ...selection,
  }
}

let session: ReturnType<typeof createInspection> | null = null

/** The module-level inspection session shared by all views. */
export function useInspection() {
  return (session ??= createInspection())
}
