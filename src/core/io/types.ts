export interface RandomAccessReader {
  readonly size: number
  read(offset: number, length: number): Promise<Uint8Array>
}

export interface ReaderOptions {
  /**
   * What to do when a read starts inside the source but extends past its end.
   * `false` (default): throw OutOfBoundsError. `true`: return the bytes that exist.
   * A read that starts beyond `size` always throws.
   */
  clamp?: boolean
}

export class OutOfBoundsError extends Error {
  readonly offset: number
  readonly length: number
  readonly size: number

  constructor(offset: number, length: number, size: number) {
    super(
      `Read of ${length} bytes at offset ${offset} is out of bounds (size ${size})`,
    )
    this.name = 'OutOfBoundsError'
    this.offset = offset
    this.length = length
    this.size = size
  }
}

/**
 * Validates a read request and returns the effective length to read.
 * Offsets past the end always throw; offset === size is allowed only for
 * zero-length reads (or when clamping, yielding an empty result).
 */
export function resolveRead(
  offset: number,
  length: number,
  size: number,
  clamp: boolean,
): number {
  if (
    !Number.isInteger(offset) ||
    !Number.isInteger(length) ||
    offset < 0 ||
    length < 0
  ) {
    throw new RangeError(`Invalid read: offset ${offset}, length ${length}`)
  }
  if (offset > size) throw new OutOfBoundsError(offset, length, size)
  if (offset + length > size) {
    if (!clamp) throw new OutOfBoundsError(offset, length, size)
    return size - offset
  }
  return length
}
