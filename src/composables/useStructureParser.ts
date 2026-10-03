import { ref, shallowRef } from 'vue'
import type { ParseResult } from '../core/model'
import type { StructureRequest, StructureResponse } from '../workers/protocol'

export type ParserStatus = 'idle' | 'parsing' | 'done' | 'error'

/** The subset of Worker the composable needs; lets tests inject a fake. */
export interface WorkerLike {
  postMessage(message: StructureRequest): void
  terminate(): void
  onmessage: ((event: MessageEvent<StructureResponse>) => void) | null
  onerror: ((event: ErrorEvent) => void) | null
}

export type WorkerFactory = () => WorkerLike

const defaultFactory: WorkerFactory = () =>
  new Worker(new URL('../workers/structure.worker.ts', import.meta.url), {
    type: 'module',
  })

export function useStructureParser(
  createWorker: WorkerFactory = defaultFactory,
) {
  const status = ref<ParserStatus>('idle')
  const result = shallowRef<ParseResult | null>(null)
  const error = ref<string | null>(null)
  let worker: WorkerLike | null = null
  let currentId = 0

  function stop() {
    worker?.terminate()
    worker = null
  }

  /** Parses `file`; any parse still in flight is cancelled. */
  function parse(file: File) {
    stop()
    const id = ++currentId
    status.value = 'parsing'
    result.value = null
    error.value = null

    const w = createWorker()
    worker = w
    const fail = (message: string) => {
      if (id !== currentId) return
      error.value = message
      status.value = 'error'
      stop()
    }
    w.onmessage = ({ data }) => {
      if (data.id !== id) return
      if (data.type === 'result') {
        result.value = data.result
        status.value = 'done'
        stop()
      } else {
        fail(data.message)
      }
    }
    w.onerror = (event) => fail(event.message || 'Worker failed')
    w.postMessage({ type: 'parse', id, file })
  }

  /** Cancels any running parse and returns to idle. */
  function cancel() {
    currentId++
    stop()
    status.value = 'idle'
  }

  return { parse, cancel, result, status, error }
}
