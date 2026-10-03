import { ByteView, hex32 } from '../../core/binary'
import type { Rational, TagValue } from './tags'

/** TIFF field type ids (1-12 from TIFF 6.0, 13 from TIFF Technical Note 1 / EXIF). */
const TYPES: Record<number, { name: string; size: number }> = {
  1: { name: 'BYTE', size: 1 },
  2: { name: 'ASCII', size: 1 },
  3: { name: 'SHORT', size: 2 },
  4: { name: 'LONG', size: 4 },
  5: { name: 'RATIONAL', size: 8 },
  6: { name: 'SBYTE', size: 1 },
  7: { name: 'UNDEFINED', size: 1 },
  8: { name: 'SSHORT', size: 2 },
  9: { name: 'SLONG', size: 4 },
  10: { name: 'SRATIONAL', size: 8 },
  11: { name: 'FLOAT', size: 4 },
  12: { name: 'DOUBLE', size: 8 },
  13: { name: 'IFD', size: 4 },
}

export function tiffTypeInfo(
  code: number,
): { name: string; size: number } | undefined {
  return TYPES[code]
}

/** Max array items decoded into a value summary. */
export const MAX_SUMMARY_ITEMS = 16
const MAX_ASCII_CHARS = 256

/** Number of bytes needed to summarise `count` items of `size` bytes. */
export function summaryByteLength(
  typeName: string,
  size: number,
  count: number,
): number {
  const limit = typeName === 'ASCII' ? MAX_ASCII_CHARS : MAX_SUMMARY_ITEMS
  return Math.min(count, limit) * size
}

/**
 * Short human readable summary of a value. `bytes` must hold at least
 * `summaryByteLength(...)` bytes of the value.
 */
export function summarizeValue(
  typeName: string,
  size: number,
  count: number,
  bytes: Uint8Array,
  littleEndian: boolean,
): string {
  const view = new ByteView(bytes, littleEndian)
  if (typeName === 'ASCII') {
    const shown = Math.min(count, MAX_ASCII_CHARS)
    const { text } = view.ascii(0, shown)
    return JSON.stringify(text) + (count > shown ? '…' : '')
  }
  const shown = Math.min(count, MAX_SUMMARY_ITEMS)
  const items: string[] = []
  for (let i = 0; i < shown; i++) {
    const at = i * size
    switch (typeName) {
      case 'BYTE':
        items.push(String(view.u8(at)))
        break
      case 'UNDEFINED':
        items.push(view.u8(at).toString(16).toUpperCase().padStart(2, '0'))
        break
      case 'SBYTE':
        items.push(String(view.i8(at)))
        break
      case 'SHORT':
        items.push(String(view.u16(at)))
        break
      case 'SSHORT':
        items.push(String(view.i16(at)))
        break
      case 'LONG':
        items.push(String(view.u32(at)))
        break
      case 'SLONG':
        items.push(String(view.i32(at)))
        break
      case 'IFD':
        items.push(hex32(view.u32(at)))
        break
      case 'RATIONAL': {
        const r = view.rational(at)
        items.push(`${r.num}/${r.den}`)
        break
      }
      case 'SRATIONAL': {
        const r = view.srational(at)
        items.push(`${r.num}/${r.den}`)
        break
      }
      case 'FLOAT':
        items.push(String(view.f32(at)))
        break
      case 'DOUBLE':
        items.push(String(view.f64(at)))
        break
    }
  }
  const more = count > shown ? `, … (${count - shown} more)` : ''
  return items.join(typeName === 'UNDEFINED' ? ' ' : ', ') + more
}

/** Decodes up to MAX_SUMMARY_ITEMS items of a field for tag formatters. */
export function decodeValue(
  typeName: string,
  size: number,
  count: number,
  bytes: Uint8Array,
  littleEndian: boolean,
): TagValue {
  const view = new ByteView(bytes, littleEndian)
  if (typeName === 'ASCII') {
    const { text } = view.ascii(0, Math.min(count, MAX_ASCII_CHARS))
    return { type: typeName, count, items: [], text, littleEndian }
  }
  const shown = Math.min(count, MAX_SUMMARY_ITEMS)
  const items: (number | Rational)[] = []
  for (let i = 0; i < shown; i++) {
    const at = i * size
    switch (typeName) {
      case 'BYTE':
      case 'UNDEFINED':
        items.push(view.u8(at))
        break
      case 'SBYTE':
        items.push(view.i8(at))
        break
      case 'SHORT':
        items.push(view.u16(at))
        break
      case 'SSHORT':
        items.push(view.i16(at))
        break
      case 'LONG':
      case 'IFD':
        items.push(view.u32(at))
        break
      case 'SLONG':
        items.push(view.i32(at))
        break
      case 'RATIONAL':
        items.push(view.rational(at))
        break
      case 'SRATIONAL':
        items.push(view.srational(at))
        break
      case 'FLOAT':
        items.push(view.f32(at))
        break
      case 'DOUBLE':
        items.push(view.f64(at))
        break
    }
  }
  return { type: typeName, count, items, littleEndian }
}
