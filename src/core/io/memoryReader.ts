import {
  resolveRead,
  type RandomAccessReader,
  type ReaderOptions,
} from './types'

export function createMemoryReader(
  bytes: Uint8Array,
  options: ReaderOptions = {},
): RandomAccessReader {
  const clamp = options.clamp ?? false
  return {
    size: bytes.length,
    async read(offset, length) {
      const n = resolveRead(offset, length, bytes.length, clamp)
      return bytes.slice(offset, offset + n)
    },
  }
}
