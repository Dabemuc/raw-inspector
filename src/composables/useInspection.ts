import { computed, ref, shallowRef, watch } from 'vue'
import { createFileReader } from '../core/io'
import { useMetadata } from './useMetadata'
import { useRawDecode } from './useRawDecode'
import { useSelection } from './useSelection'
import { useStructureParser } from './useStructureParser'

export const AUTO_RENDER_KEY = 'raw-inspector:auto-render'

/** Auto-render defaults to on; any storage failure falls back to on. */
export function readAutoRender(): boolean {
  try {
    return localStorage.getItem(AUTO_RENDER_KEY) !== 'false'
  } catch {
    return true
  }
}

function writeAutoRender(value: boolean) {
  try {
    localStorage.setItem(AUTO_RENDER_KEY, String(value))
  } catch {
    // Storage unavailable; the setting only lasts for this session.
  }
}

export type InspectionMode = 'overview' | 'technical'

/** Anything other than `#technical` falls back to overview. */
export function modeFromHash(hash: string): InspectionMode {
  return hash.replace(/^#/, '') === 'technical' ? 'technical' : 'overview'
}

export function createInspection() {
  const parser = useStructureParser()
  const decoder = useRawDecode()
  const metadata = useMetadata(parser.result)
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

  const autoRender = ref(readAutoRender())
  watch(autoRender, writeAutoRender)
  /** True once a full-resolution render was requested for the current file. */
  const fullResolution = ref(false)
  watch(decoder.status, (s) => {
    if (s === 'error') fullResolution.value = false
  })

  /** Starts the half-size render (runs in parallel with structure parsing). */
  function render() {
    if (!file.value) return
    fullResolution.value = false
    decoder.decode(file.value, { halfSize: true })
  }

  /** Re-decodes at full size, keeping the current image until it is ready. */
  function renderFull() {
    if (!file.value) return
    fullResolution.value = true
    decoder.decode(file.value, { halfSize: false }, true)
  }

  /** Loads a new file, cancelling every running job and resetting state. */
  function load(next: File) {
    decoder.cancel()
    metadata.cancel()
    selection.clear()
    file.value = next
    fullResolution.value = false
    parser.parse(next)
    metadata.read(next)
    if (autoRender.value) render()
  }

  function reset() {
    decoder.cancel()
    metadata.cancel()
    parser.cancel()
    selection.setParseResult(null)
    file.value = null
    fullResolution.value = false
  }

  return {
    file,
    fileName,
    reader,
    mode,
    setMode,
    load,
    autoRender,
    fullResolution,
    render,
    renderFull,
    reset,
    parser,
    decoder,
    metadata,
    ...selection,
  }
}

let session: ReturnType<typeof createInspection> | null = null

/** The module-level inspection session shared by all views. */
export function useInspection() {
  return (session ??= createInspection())
}
