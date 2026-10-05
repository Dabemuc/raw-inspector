import { shallowRef } from 'vue'
import { describe, expect, it } from 'vitest'
import {
  useMetadata,
  type MetadataWorkerLike,
} from '../../src/composables/useMetadata'
import type { ParseResult } from '../../src/core/model'
import { exampleResult } from '../../src/core/model/example'
import type { MetadataResult } from '../../src/metadata/types'
import type {
  MetadataRequest,
  MetadataResponse,
} from '../../src/workers/metadata-protocol'

type Fake = MetadataWorkerLike & {
  terminated: boolean
  sent: MetadataRequest[]
}

function fakeWorkers() {
  const workers: Fake[] = []
  const factory = () => {
    const w = {
      terminated: false,
      sent: [] as MetadataRequest[],
      onmessage: null,
      onerror: null,
      postMessage(m: MetadataRequest) {
        w.sent.push(m)
      },
      terminate() {
        w.terminated = true
      },
    } as Fake
    workers.push(w)
    return w
  }
  const reply = (i: number, data: MetadataResponse) =>
    workers[i]!.onmessage!({ data } as MessageEvent<MetadataResponse>)
  return { workers, factory, reply }
}

const file = new File([new Uint8Array(8)], 'a.dng')
const engine: MetadataResult = {
  source: 'engine',
  engine: 'ExifTool',
  groups: [{ id: 'File:File', family: 'File', name: 'File', tags: [] }],
}

function setup() {
  const parse = shallowRef<ParseResult | null>(null)
  const f = fakeWorkers()
  return { parse, f, m: useMetadata(parse, f.factory) }
}

describe('useMetadata', () => {
  it('starts idle with no worker and no result', () => {
    const { f, m } = setup()
    expect(m.status.value).toBe('idle')
    expect(m.result.value).toBeNull()
    expect(f.workers).toHaveLength(0)
  })

  it('posts a read request and reports loading', () => {
    const { f, m } = setup()
    m.read(file)
    expect(m.status.value).toBe('loading')
    expect(f.workers[0]!.sent).toEqual([{ type: 'read', id: 1, file }])
  })

  it('shows the parser fallback first, then the engine result', () => {
    const { parse, f, m } = setup()
    m.read(file)
    parse.value = exampleResult
    expect(m.result.value?.source).toBe('parser')
    f.reply(0, { type: 'result', id: 1, result: engine })
    expect(m.status.value).toBe('ready')
    expect(m.result.value).toBe(engine)
    expect(f.workers[0]!.terminated).toBe(true)
  })

  it('keeps the fallback and records the error when the engine fails', () => {
    const { parse, f, m } = setup()
    parse.value = exampleResult
    m.read(file)
    f.reply(0, { type: 'error', id: 1, message: 'wasm failed' })
    expect(m.status.value).toBe('failed')
    expect(m.error.value).toBe('wasm failed')
    expect(m.result.value?.source).toBe('parser')
  })

  it('fails when the worker itself errors', () => {
    const { f, m } = setup()
    m.read(file)
    f.workers[0]!.onerror!({ message: '' } as ErrorEvent)
    expect(m.status.value).toBe('failed')
    expect(m.error.value).toBe('Worker failed')
  })

  it('cancel terminates the worker, tells it to drop the job and resets', () => {
    const { f, m } = setup()
    m.read(file)
    m.cancel()
    expect(f.workers[0]!.sent.at(-1)).toEqual({ type: 'cancel', id: 1 })
    expect(f.workers[0]!.terminated).toBe(true)
    expect(m.status.value).toBe('idle')
    f.reply(0, { type: 'result', id: 1, result: engine })
    expect(m.result.value).toBeNull()
    expect(m.status.value).toBe('idle')
  })

  it('a new read supersedes the previous one', () => {
    const { f, m } = setup()
    m.read(file)
    m.read(file)
    expect(f.workers[0]!.terminated).toBe(true)
    f.reply(0, { type: 'result', id: 1, result: engine })
    expect(m.status.value).toBe('loading')
    f.reply(1, { type: 'result', id: 2, result: engine })
    expect(m.status.value).toBe('ready')
  })
})
