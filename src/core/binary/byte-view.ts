import { OutOfBoundsError } from './errors'

export interface Rational {
  num: number
  den: number
}

export interface AsciiResult {
  /** Text up to (not including) the first NUL, or the full length if none. */
  text: string
  /** Number of bytes after the first NUL within the requested range. */
  trailing: number
}

/** Bounds-checked, endian-aware reader over a Uint8Array. */
export class ByteView {
  readonly data: Uint8Array
  readonly littleEndian: boolean
  private readonly view: DataView

  constructor(data: Uint8Array, littleEndian: boolean) {
    this.data = data
    this.littleEndian = littleEndian
    this.view = new DataView(data.buffer, data.byteOffset, data.byteLength)
  }

  get length(): number {
    return this.data.byteLength
  }

  /** Same data with a different byte order (e.g. for MakerNotes). */
  withEndian(littleEndian: boolean): ByteView {
    return new ByteView(this.data, littleEndian)
  }

  private check(offset: number, length: number): void {
    if (
      !Number.isInteger(offset) ||
      !Number.isInteger(length) ||
      offset < 0 ||
      length < 0 ||
      offset + length > this.data.byteLength
    ) {
      throw new OutOfBoundsError(offset, length, this.data.byteLength)
    }
  }

  u8(offset: number): number {
    this.check(offset, 1)
    return this.view.getUint8(offset)
  }

  i8(offset: number): number {
    this.check(offset, 1)
    return this.view.getInt8(offset)
  }

  u16(offset: number): number {
    this.check(offset, 2)
    return this.view.getUint16(offset, this.littleEndian)
  }

  i16(offset: number): number {
    this.check(offset, 2)
    return this.view.getInt16(offset, this.littleEndian)
  }

  u32(offset: number): number {
    this.check(offset, 4)
    return this.view.getUint32(offset, this.littleEndian)
  }

  i32(offset: number): number {
    this.check(offset, 4)
    return this.view.getInt32(offset, this.littleEndian)
  }

  f32(offset: number): number {
    this.check(offset, 4)
    return this.view.getFloat32(offset, this.littleEndian)
  }

  f64(offset: number): number {
    this.check(offset, 8)
    return this.view.getFloat64(offset, this.littleEndian)
  }

  /** Unsigned rational; a zero denominator is returned as-is. */
  rational(offset: number): Rational {
    return { num: this.u32(offset), den: this.u32(offset + 4) }
  }

  /** Signed rational; a zero denominator is returned as-is. */
  srational(offset: number): Rational {
    return { num: this.i32(offset), den: this.i32(offset + 4) }
  }

  ascii(offset: number, length: number): AsciiResult {
    const raw = this.bytes(offset, length)
    const nul = raw.indexOf(0)
    const end = nul === -1 ? length : nul
    let text = ''
    for (let i = 0; i < end; i++) text += String.fromCharCode(raw[i]!)
    return { text, trailing: nul === -1 ? 0 : length - nul - 1 }
  }

  bytes(offset: number, length: number): Uint8Array {
    this.check(offset, length)
    return this.data.subarray(offset, offset + length)
  }
}
