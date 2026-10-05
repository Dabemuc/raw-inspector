import { computed, ref, shallowRef, type Ref } from 'vue'
import type { ParseResult } from '../core/model'
import { metadataFromParseResult } from '../metadata/fromParseResult'
import type { MetadataResult } from '../metadata/types'
import type {
  MetadataRequest,
  MetadataResponse,
} from '../workers/metadata-protocol'

export type MetadataStatus = 'idle' | 'loading' | 'ready' | 'failed'

export interface MetadataWorkerLike {
  postMessage(message: MetadataRequest): void
  terminate(): void
  onmessage: ((event: MessageEvent<MetadataResponse>) => void) | null
  onerror: ((event: ErrorEvent) => void) | null
}

export type MetadataWorkerFactory = () => MetadataWorkerLike

const defaultFactory: MetadataWorkerFactory = () =>
  new Worker(new URL('../workers/metadata.worker.ts', import.meta.url), {
    type: 'module',
  })

/**
 * Reads all metadata of a file in a lazy worker. `result` is the parser
 * fallback (from `parseResult`) until the engine finishes, and stays the
 * fallback if the engine fails.
 */
export function useMetadata(
  parseResult: Ref<ParseResult | null>,
  createWorker: MetadataWorkerFactory = defaultFactory,
) {
  const status = ref<MetadataStatus>('idle')
  const engineResult = shallowRef<MetadataResult | null>(null)
  const error = ref<string | null>(null)
  let worker: MetadataWorkerLike | null = null
  let currentId = 0

  const fallback = computed(() =>
    parseResult.value ? metadataFromParseResult(parseResult.value) : null,
  )
  const result = computed(() => engineResult.value ?? fallback.value)

  function stop() {
    worker?.terminate()
    worker = null
  }

  /** Starts reading `file`; any read in flight is cancelled. */
  function read(file: File) {
    stop()
    const id = ++currentId
    status.value = 'loading'
    engineResult.value = null
    error.value = null

    const w = createWorker()
    worker = w
    const fail = (message: string) => {
      if (id !== currentId) return
      error.value = message
      status.value = 'failed'
      stop()
    }
    w.onmessage = ({ data }) => {
      if (data.id !== currentId) return
      if (data.type === 'result') {
        engineResult.value = data.result
        status.value = 'ready'
        stop()
      } else if (data.type === 'error') {
        fail(data.message)
      }
    }
    w.onerror = (event) => fail(event.message || 'Worker failed')
    w.postMessage({ type: 'read', id, file })
  }

  /** Cancels a running read and clears state. */
  function cancel() {
    if (worker) worker.postMessage({ type: 'cancel', id: currentId })
    currentId++
    stop()
    status.value = 'idle'
    engineResult.value = null
    error.value = null
  }

  return { read, cancel, status, result, error }
}
