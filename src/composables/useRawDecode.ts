import { ref, shallowRef } from 'vue'
import type {
  CameraMetadata,
  DecodeOptions,
  DecodeStage,
  LibRawRequest,
  LibRawResponse,
} from '../workers/libraw-protocol'

export type DecodeStatus = 'idle' | 'decoding' | 'done' | 'error'

export interface DecodedImage {
  width: number
  height: number
  /** RGBA, 8 bit. */
  rgba: Uint8ClampedArray<ArrayBuffer>
}

export interface LibRawWorkerLike {
  postMessage(message: LibRawRequest): void
  terminate(): void
  onmessage: ((event: MessageEvent<LibRawResponse>) => void) | null
  onerror: ((event: ErrorEvent) => void) | null
}

export type LibRawWorkerFactory = () => LibRawWorkerLike

const defaultFactory: LibRawWorkerFactory = () =>
  new Worker(new URL('../workers/libraw.worker.ts', import.meta.url), {
    type: 'module',
  })

const OOM_HINT =
  'Out of memory while decoding. Try the half-size option, or close other tabs.'

export function useRawDecode(
  createWorker: LibRawWorkerFactory = defaultFactory,
) {
  const status = ref<DecodeStatus>('idle')
  /** Current stage; null means indeterminate (LibRaw reports no percentage). */
  const progress = ref<DecodeStage | null>(null)
  const image = shallowRef<DecodedImage | null>(null)
  const metadata = shallowRef<CameraMetadata | null>(null)
  const error = ref<string | null>(null)
  let worker: LibRawWorkerLike | null = null
  let currentId = 0

  function stop() {
    worker?.terminate()
    worker = null
  }

  /**
   * Decodes `file`; any decode still in flight is cancelled. With
   * `keepImage` the previous image stays visible until the new one is ready.
   */
  function decode(
    file: File,
    options: DecodeOptions = { halfSize: true },
    keepImage = false,
  ) {
    stop()
    const id = ++currentId
    status.value = 'decoding'
    progress.value = null
    if (!keepImage) {
      image.value = null
      metadata.value = null
    }
    error.value = null

    const w = createWorker()
    worker = w
    const fail = (message: string) => {
      if (id !== currentId) return
      error.value = message
      status.value = 'error'
      progress.value = null
      stop()
    }
    w.onmessage = ({ data }) => {
      if (data.id !== currentId) return
      if (data.type === 'progress') {
        progress.value = data.stage
      } else if (data.type === 'result') {
        image.value = {
          width: data.width,
          height: data.height,
          rgba: new Uint8ClampedArray(data.rgba),
        }
        metadata.value = data.metadata
        status.value = 'done'
        progress.value = null
        stop()
      } else {
        fail(data.outOfMemory ? OOM_HINT : data.message)
      }
    }
    w.onerror = (event) => fail(event.message || 'Worker failed')
    w.postMessage({ type: 'decode', id, file, options })
  }

  /** Cancels a running decode (terminates the worker) and resets state. */
  function cancel() {
    currentId++
    stop()
    status.value = 'idle'
    progress.value = null
    image.value = null
    metadata.value = null
    error.value = null
  }

  return { decode, cancel, status, progress, image, metadata, error }
}
