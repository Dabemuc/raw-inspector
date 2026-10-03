import {
  resolveRead,
  type RandomAccessReader,
  type ReaderOptions,
} from './types'

export interface FileReaderOptions extends ReaderOptions {
  /** Cache block size in bytes. Default 64 KiB. */
  blockSize?: number
  /** Maximum number of blocks kept in the LRU cache. Default 64 (4 MiB at the default block size). */
  maxBlocks?: number
}

const DEFAULT_BLOCK_SIZE = 64 * 1024
const DEFAULT_MAX_BLOCKS = 64

/**
 * Reads from a Blob/File via `slice().arrayBuffer()` through a bounded LRU
 * block cache, so many nearby small reads cost a single slice.
 * Works on the main thread and in Web Workers.
 */
export function createFileReader(
  blob: Blob,
  options: FileReaderOptions = {},
): RandomAccessReader {
  const clamp = options.clamp ?? false
  const blockSize = options.blockSize ?? DEFAULT_BLOCK_SIZE
  const maxBlocks = options.maxBlocks ?? DEFAULT_MAX_BLOCKS
  const size = blob.size
  // Map preserves insertion order; we re-insert on hit so the first key is the LRU.
  // Promises are cached so concurrent reads of one block share a single slice.
  const cache = new Map<number, Promise<Uint8Array>>()

  function getBlock(index: number): Promise<Uint8Array> {
    const hit = cache.get(index)
    if (hit) {
      cache.delete(index)
      cache.set(index, hit)
      return hit
    }
    const start = index * blockSize
    const p = blob
      .slice(start, Math.min(start + blockSize, size))
      .arrayBuffer()
      .then((buf) => new Uint8Array(buf))
    p.catch(() => {
      if (cache.get(index) === p) cache.delete(index)
    })
    cache.set(index, p)
    if (cache.size > maxBlocks) {
      cache.delete(cache.keys().next().value as number)
    }
    return p
  }

  return {
    size,
    async read(offset, length) {
      const n = resolveRead(offset, length, size, clamp)
      const out = new Uint8Array(n)
      if (n === 0) return out
      const first = Math.floor(offset / blockSize)
      const last = Math.floor((offset + n - 1) / blockSize)
      const blocks = await Promise.all(
        Array.from({ length: last - first + 1 }, (_, i) => getBlock(first + i)),
      )
      let written = 0
      for (let i = 0; i < blocks.length; i++) {
        const blockStart = (first + i) * blockSize
        const from = Math.max(offset, blockStart) - blockStart
        const to = Math.min(offset + n, blockStart + blockSize) - blockStart
        out.set(blocks[i]!.subarray(from, to), written)
        written += to - from
      }
      return out
    },
  }
}
