import { describe, expect, it } from 'vitest'
import {
  useRawDecode,
  type LibRawWorkerLike,
} from '../../src/composables/useRawDecode'
import type {
  CameraMetadata,
  LibRawResponse,
} from '../../src/workers/libraw-protocol'

type Fake = LibRawWorkerLike & { terminated: boolean; sent: unknown[] }

function fakeWorkers() {
  const workers: Fake[] = []
  const factory = () => {
    const w = {
      terminated: false,
      sent: [] as unknown[],
      onmessage: null,
      onerror: null,
      postMessage(m: unknown) {
        w.sent.push(m)
      },
      terminate() {
        w.terminated = true
      },
    } as Fake
    workers.push(w)
    return w
  }
  const reply = (i: number, data: LibRawResponse) =>
    workers[i]!.onmessage!({ data } as MessageEvent<LibRawResponse>)
  return { workers, factory, reply }
}

const file = new File([new Uint8Array(8)], 'a.dng')
const metadata = { make: 'Acme', model: 'X1' } as CameraMetadata
const result = (id: number): LibRawResponse => ({
  type: 'result',
  id,
  width: 2,
  height: 1,
  rgba: new Uint8Array([1, 2, 3, 255, 4, 5, 6, 255]).buffer,
  metadata,
})

describe('useRawDecode', () => {
  it('starts idle and creates no worker', () => {
    const f = fakeWorkers()
    const d = useRawDecode(f.factory)
    expect(d.status.value).toBe('idle')
    expect(f.workers).toHaveLength(0)
  })

  it('posts a decode request with options', () => {
    const f = fakeWorkers()
    const d = useRawDecode(f.factory)
    d.decode(file, { halfSize: false })
    expect(d.status.value).toBe('decoding')
    expect(f.workers[0]!.sent).toEqual([
      { type: 'decode', id: 1, file, options: { halfSize: false } },
    ])
  })

  it('tracks progress stages', () => {
    const f = fakeWorkers()
    const d = useRawDecode(f.factory)
    d.decode(file)
    f.reply(0, { type: 'progress', id: 1, stage: 'unpacking' })
    expect(d.progress.value).toBe('unpacking')
  })

  it('stores image and metadata on result', () => {
    const f = fakeWorkers()
    const d = useRawDecode(f.factory)
    d.decode(file)
    f.reply(0, result(1))
    expect(d.status.value).toBe('done')
    expect(d.image.value?.width).toBe(2)
    expect([...d.image.value!.rgba]).toEqual([1, 2, 3, 255, 4, 5, 6, 255])
    expect(d.metadata.value).toBe(metadata)
    expect(f.workers[0]!.terminated).toBe(true)
  })

  it('reports worker errors', () => {
    const f = fakeWorkers()
    const d = useRawDecode(f.factory)
    d.decode(file)
    f.reply(0, {
      type: 'error',
      id: 1,
      message: 'Unsupported file format',
      outOfMemory: false,
    })
    expect(d.status.value).toBe('error')
    expect(d.error.value).toBe('Unsupported file format')
  })

  it('gives a friendly message for out of memory', () => {
    const f = fakeWorkers()
    const d = useRawDecode(f.factory)
    d.decode(file)
    f.reply(0, { type: 'error', id: 1, message: 'oom', outOfMemory: true })
    expect(d.error.value).toMatch(/half-size/)
  })

  it('reports worker crashes', () => {
    const f = fakeWorkers()
    const d = useRawDecode(f.factory)
    d.decode(file)
    f.workers[0]!.onerror!({ message: 'boom' } as ErrorEvent)
    expect(d.status.value).toBe('error')
    expect(d.error.value).toBe('boom')
  })

  it('cancel terminates the worker and ignores late replies', () => {
    const f = fakeWorkers()
    const d = useRawDecode(f.factory)
    d.decode(file)
    d.cancel()
    expect(f.workers[0]!.terminated).toBe(true)
    expect(d.status.value).toBe('idle')
    f.reply(0, result(1))
    expect(d.image.value).toBeNull()
  })

  it('a new decode supersedes the previous one', () => {
    const f = fakeWorkers()
    const d = useRawDecode(f.factory)
    d.decode(file)
    d.decode(file, { halfSize: false })
    expect(f.workers[0]!.terminated).toBe(true)
    f.reply(0, result(1))
    expect(d.status.value).toBe('decoding')
    f.reply(1, result(2))
    expect(d.status.value).toBe('done')
  })

  it('keeps the previous image while re-decoding with keepImage', () => {
    const f = fakeWorkers()
    const d = useRawDecode(f.factory)
    d.decode(file)
    f.reply(0, result(1))
    d.decode(file, { halfSize: false }, true)
    expect(d.status.value).toBe('decoding')
    expect(d.image.value?.width).toBe(2)
    f.reply(1, { ...result(2), width: 4 } as LibRawResponse)
    expect(d.image.value?.width).toBe(4)
  })
})
