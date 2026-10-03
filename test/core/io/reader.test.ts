import { describe, expect, it, vi } from 'vitest'
import {
  createFileReader,
  createMemoryReader,
  OutOfBoundsError,
  type RandomAccessReader,
} from '../../../src/core/io'

const BLOCK = 16
const data = Uint8Array.from({ length: 100 }, (_, i) => i)

type Factory = (opts?: { clamp?: boolean }) => RandomAccessReader

const factories: Record<string, Factory> = {
  memory: (opts) => createMemoryReader(data, opts),
  file: (opts) =>
    createFileReader(new Blob([data]), { ...opts, blockSize: BLOCK }),
}

describe.each(Object.entries(factories))(
  '%s reader (shared suite)',
  (_name, make) => {
    it('reports size', () => {
      expect(make().size).toBe(100)
    })

    it('reads at start', async () => {
      expect(await make().read(0, 5)).toEqual(data.slice(0, 5))
    })

    it('reads in the middle', async () => {
      expect(await make().read(40, 7)).toEqual(data.slice(40, 47))
    })

    it('reads at end', async () => {
      expect(await make().read(95, 5)).toEqual(data.slice(95, 100))
    })

    it('reads spanning two (and more) blocks', async () => {
      const r = make()
      expect(await r.read(BLOCK - 2, 4)).toEqual(
        data.slice(BLOCK - 2, BLOCK + 2),
      )
      expect(await r.read(10, 50)).toEqual(data.slice(10, 60))
    })

    it('supports zero-length reads', async () => {
      expect((await make().read(10, 0)).length).toBe(0)
      expect((await make().read(100, 0)).length).toBe(0)
    })

    it('throws OutOfBoundsError when starting past the end', async () => {
      await expect(make().read(101, 1)).rejects.toBeInstanceOf(OutOfBoundsError)
      await expect(make({ clamp: true }).read(101, 1)).rejects.toBeInstanceOf(
        OutOfBoundsError,
      )
    })

    it('throws when extending past the end by default', async () => {
      await expect(make().read(98, 5)).rejects.toBeInstanceOf(OutOfBoundsError)
    })

    it('clamps when extending past the end with clamp: true', async () => {
      expect(await make({ clamp: true }).read(98, 5)).toEqual(data.slice(98))
    })

    it('rejects invalid arguments', async () => {
      await expect(make().read(-1, 1)).rejects.toBeInstanceOf(RangeError)
      await expect(make().read(0, -1)).rejects.toBeInstanceOf(RangeError)
    })
  },
)

describe('file reader cache', () => {
  it('serves many small reads within one block with one slice', async () => {
    const blob = new Blob([data])
    const slice = vi.spyOn(blob, 'slice')
    const r = createFileReader(blob, { blockSize: BLOCK })
    for (let i = 0; i < 10; i++) await r.read(i, 1)
    expect(slice).toHaveBeenCalledTimes(1)
  })

  it('shares one slice between concurrent reads of the same block', async () => {
    const blob = new Blob([data])
    const slice = vi.spyOn(blob, 'slice')
    const r = createFileReader(blob, { blockSize: BLOCK })
    await Promise.all([r.read(0, 2), r.read(4, 2), r.read(8, 2)])
    expect(slice).toHaveBeenCalledTimes(1)
  })

  it('evicts least recently used blocks beyond maxBlocks', async () => {
    const blob = new Blob([data])
    const slice = vi.spyOn(blob, 'slice')
    const r = createFileReader(blob, { blockSize: BLOCK, maxBlocks: 2 })
    await r.read(0, 1) // block 0
    await r.read(BLOCK, 1) // block 1
    await r.read(0, 1) // touch 0 -> 1 is LRU
    await r.read(2 * BLOCK, 1) // block 2 evicts 1
    expect(slice).toHaveBeenCalledTimes(3)
    await r.read(0, 1) // still cached
    expect(slice).toHaveBeenCalledTimes(3)
    await r.read(BLOCK, 1) // evicted, refetched
    expect(slice).toHaveBeenCalledTimes(4)
  })
})
