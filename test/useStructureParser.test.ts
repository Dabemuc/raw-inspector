import { describe, expect, it } from 'vitest'
import { createFileReader } from '../src/core/io'
import { parseFile } from '../src/parsers'
import {
  useStructureParser,
  type WorkerLike,
} from '../src/composables/useStructureParser'
import type { StructureResponse } from '../src/workers/protocol'
import { TiffBuilder } from './helpers/tiffBuilder'

function fakeWorkers() {
  const workers: (WorkerLike & { terminated: boolean; sent: unknown[] })[] = []
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
    } as WorkerLike & { terminated: boolean; sent: unknown[] }
    workers.push(w)
    return w
  }
  const reply = (i: number, data: StructureResponse) =>
    workers[i]!.onmessage!({ data } as MessageEvent<StructureResponse>)
  return { workers, factory, reply }
}

const file = new File([new Uint8Array(8)], 'a.dng')

describe('useStructureParser', () => {
  it('starts idle', () => {
    const p = useStructureParser(fakeWorkers().factory)
    expect(p.status.value).toBe('idle')
  })

  it('posts a parse request and stores the result', async () => {
    const f = fakeWorkers()
    const p = useStructureParser(f.factory)
    p.parse(file)
    expect(p.status.value).toBe('parsing')
    expect(f.workers[0]!.sent).toEqual([{ type: 'parse', id: 1, file }])
    const result = await parseFile(createFileReader(file))
    f.reply(0, { type: 'result', id: 1, result })
    expect(p.status.value).toBe('done')
    expect(p.result.value).toEqual(result)
    expect(f.workers[0]!.terminated).toBe(true)
  })

  it('cancels the previous parse when a new file is parsed', () => {
    const f = fakeWorkers()
    const p = useStructureParser(f.factory)
    p.parse(file)
    p.parse(file)
    expect(f.workers[0]!.terminated).toBe(true)
    // late message from the cancelled worker is ignored
    f.reply(0, { type: 'error', id: 1, message: 'stale' })
    expect(p.status.value).toBe('parsing')
    expect(p.error.value).toBeNull()
  })

  it('cancel() returns to idle', () => {
    const f = fakeWorkers()
    const p = useStructureParser(f.factory)
    p.parse(file)
    p.cancel()
    expect(p.status.value).toBe('idle')
    expect(f.workers[0]!.terminated).toBe(true)
  })

  it('reports worker error messages', () => {
    const f = fakeWorkers()
    const p = useStructureParser(f.factory)
    p.parse(file)
    f.reply(0, { type: 'error', id: 1, message: 'boom' })
    expect(p.status.value).toBe('error')
    expect(p.error.value).toBe('boom')
  })

  it('reports uncaught worker errors', () => {
    const f = fakeWorkers()
    const p = useStructureParser(f.factory)
    p.parse(file)
    f.workers[0]!.onerror!({ message: 'crash' } as ErrorEvent)
    expect(p.status.value).toBe('error')
    expect(p.error.value).toBe('crash')
  })
})

describe('ParseResult across the worker boundary', () => {
  it('survives structuredClone unchanged', async () => {
    const t = new TiffBuilder()
    t.ifd().entry(0x100, 'SHORT', [640]).entry(0x10f, 'ASCII', 'Make')
    const result = await parseFile(
      createFileReader(new Blob([t.build().bytes as BlobPart])),
    )
    expect(structuredClone(result)).toEqual(result)
  })
})
