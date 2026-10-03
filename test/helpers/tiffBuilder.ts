export type ByteOrder = 'II' | 'MM'

export type TiffType =
  | 'BYTE'
  | 'ASCII'
  | 'SHORT'
  | 'LONG'
  | 'RATIONAL'
  | 'SBYTE'
  | 'UNDEFINED'
  | 'SSHORT'
  | 'SLONG'
  | 'SRATIONAL'
  | 'FLOAT'
  | 'DOUBLE'
  | 'IFD'

const TYPE_INFO: Record<TiffType, { code: number; size: number }> = {
  BYTE: { code: 1, size: 1 },
  ASCII: { code: 2, size: 1 },
  SHORT: { code: 3, size: 2 },
  LONG: { code: 4, size: 4 },
  RATIONAL: { code: 5, size: 8 },
  SBYTE: { code: 6, size: 1 },
  UNDEFINED: { code: 7, size: 1 },
  SSHORT: { code: 8, size: 2 },
  SLONG: { code: 9, size: 4 },
  SRATIONAL: { code: 10, size: 8 },
  FLOAT: { code: 11, size: 4 },
  DOUBLE: { code: 12, size: 8 },
  IFD: { code: 13, size: 4 },
}

/** A reference resolved to a number once the layout is known. */
export type Ref =
  | { kind: 'ifdOffset'; ifd: IfdBuilder }
  | { kind: 'blobOffset'; blob: Blob }
  | { kind: 'blobLength'; blob: Blob }

export type Value = number | Ref
/** Numeric values (RATIONAL/SRATIONAL: flattened numerator, denominator pairs), a string for ASCII, or raw bytes. */
export type EntryValues = Value[] | string | Uint8Array

export interface EntryOptions {
  /** Override the count field written in the entry. */
  count?: number
  /** Override the raw 4-byte value/offset field (data is still laid out, but not pointed to). */
  rawValueField?: number
}

export interface Blob {
  readonly bytes: Uint8Array
}

export interface EntryLayout {
  tag: number
  /** Offset of the 12-byte entry. */
  entryOffset: number
  /** Offset where the value bytes live (the entry's value field if inline). */
  valueOffset: number
  inline: boolean
  byteLength: number
}

export interface IfdLayout {
  offset: number
  entries: EntryLayout[]
  /** Offset of the 4-byte next-IFD pointer. */
  nextPointerOffset: number
}

export interface TiffLayout {
  ifds: IfdLayout[]
  blobs: { offset: number; length: number }[]
  /** Length of the full, untruncated file. */
  totalLength: number
}

export interface BuiltTiff {
  bytes: Uint8Array
  layout: TiffLayout
  /** Layout lookup for a given IFD builder. */
  ifdLayout(ifd: IfdBuilder): IfdLayout
}

export const ifdOffset = (ifd: IfdBuilder): Ref => ({ kind: 'ifdOffset', ifd })
export const blobOffset = (blob: Blob): Ref => ({ kind: 'blobOffset', blob })
export const blobLength = (blob: Blob): Ref => ({ kind: 'blobLength', blob })

interface Entry {
  tag: number
  type: TiffType
  values: EntryValues
  options: EntryOptions
}

export class IfdBuilder {
  readonly entries: Entry[] = []
  next: IfdBuilder | undefined
  rawNextOffset: number | undefined

  /** Add an entry. Value bytes ≤ 4 are stored inline, larger ones out-of-line. */
  entry(
    tag: number,
    type: TiffType,
    values: EntryValues,
    options: EntryOptions = {},
  ): this {
    this.entries.push({ tag, type, values, options })
    return this
  }

  /** Add a LONG (or IFD-typed) entry pointing at a sub-IFD, e.g. tag 330 or 34665. */
  subIfd(tag: number, sub: IfdBuilder, type: 'LONG' | 'IFD' = 'LONG'): this {
    return this.entry(tag, type, [ifdOffset(sub)])
  }

  /** Chain the next IFD. Pointing back at an earlier IFD creates a loop. */
  nextIfd(next: IfdBuilder): this {
    this.next = next
    return this
  }

  /** Write a raw value into the next-IFD pointer, overriding any chaining. */
  rawNext(offset: number): this {
    this.rawNextOffset = offset
    return this
  }
}

export interface TiffBuilderOptions {
  byteOrder?: ByteOrder
  /** 42 by default; 0x4f52/0x5352 for ORF, 0x55 for RW2. */
  magic?: number
}

export class TiffBuilder {
  readonly byteOrder: ByteOrder
  readonly magic: number
  private readonly ifds: IfdBuilder[] = []
  private readonly blobs: Blob[] = []
  private rawFirstIfdOffset: number | undefined
  private truncateLength: number | undefined

  constructor(options: TiffBuilderOptions = {}) {
    this.byteOrder = options.byteOrder ?? 'II'
    this.magic = options.magic ?? 42
  }

  /** Create an IFD. The first one created is the file's first IFD. */
  ifd(): IfdBuilder {
    const ifd = new IfdBuilder()
    this.ifds.push(ifd)
    return ifd
  }

  /** Attach a raw blob placed after all IFDs. */
  blob(bytes: Uint8Array | number[]): Blob {
    const blob: Blob = { bytes: Uint8Array.from(bytes) }
    this.blobs.push(blob)
    return blob
  }

  /** Override the first-IFD offset in the header. */
  rawFirstIfdOffsetValue(offset: number): this {
    this.rawFirstIfdOffset = offset
    return this
  }

  /** Cut the output to this many bytes. */
  truncateAt(length: number): this {
    this.truncateLength = length
    return this
  }

  build(): BuiltTiff {
    const little = this.byteOrder === 'II'
    const sizes = this.ifds.map((ifd) =>
      ifd.entries.map((e) => encodedLength(e)),
    )

    // Layout: header, then per IFD its table + out-of-line values, then blobs.
    let pos = 8
    const ifdLayouts: IfdLayout[] = []
    const ifdMap = new Map<IfdBuilder, IfdLayout>()
    this.ifds.forEach((ifd, i) => {
      const offset = pos
      const tableEnd = offset + 2 + 12 * ifd.entries.length + 4
      let dataPos = tableEnd
      const entries = ifd.entries.map((e, j): EntryLayout => {
        const byteLength = sizes[i]![j]!
        const entryOffset = offset + 2 + 12 * j
        const inline = byteLength <= 4
        let valueOffset = entryOffset + 8
        if (!inline) {
          valueOffset = dataPos
          dataPos += byteLength + (byteLength % 2)
        }
        return { tag: e.tag, entryOffset, valueOffset, inline, byteLength }
      })
      const layout: IfdLayout = {
        offset,
        entries,
        nextPointerOffset: tableEnd - 4,
      }
      ifdLayouts.push(layout)
      ifdMap.set(ifd, layout)
      pos = dataPos
    })
    const blobLayouts = this.blobs.map((b) => {
      const offset = pos
      pos += b.bytes.length + (b.bytes.length % 2)
      return { offset, length: b.bytes.length }
    })
    const totalLength = pos
    const layout: TiffLayout = {
      ifds: ifdLayouts,
      blobs: blobLayouts,
      totalLength,
    }

    const out = new Uint8Array(totalLength)
    const view = new DataView(out.buffer)
    const resolve = (v: Value): number => {
      if (typeof v === 'number') return v
      if (v.kind === 'ifdOffset') return ifdMap.get(v.ifd)!.offset
      const i = this.blobs.indexOf(v.blob)
      return v.kind === 'blobOffset'
        ? blobLayouts[i]!.offset
        : blobLayouts[i]!.length
    }

    out[0] = out[1] = this.byteOrder.charCodeAt(0)
    view.setUint16(2, this.magic, little)
    view.setUint32(
      4,
      this.rawFirstIfdOffset ?? ifdLayouts[0]?.offset ?? 0,
      little,
    )

    this.ifds.forEach((ifd, i) => {
      const il = ifdLayouts[i]!
      view.setUint16(il.offset, ifd.entries.length, little)
      ifd.entries.forEach((e, j) => {
        const el = il.entries[j]!
        const info = TYPE_INFO[e.type]
        const data = encodeValues(e, resolve, little)
        view.setUint16(el.entryOffset, e.tag, little)
        view.setUint16(el.entryOffset + 2, info.code, little)
        view.setUint32(
          el.entryOffset + 4,
          e.options.count ?? data.length / info.size,
          little,
        )
        out.set(data, el.valueOffset)
        if (!el.inline)
          view.setUint32(el.entryOffset + 8, el.valueOffset, little)
        if (e.options.rawValueField !== undefined) {
          view.setUint32(el.entryOffset + 8, e.options.rawValueField, little)
        }
      })
      const next =
        ifd.rawNextOffset ?? (ifd.next ? ifdMap.get(ifd.next)!.offset : 0)
      view.setUint32(il.nextPointerOffset, next, little)
    })
    this.blobs.forEach((b, i) => out.set(b.bytes, blobLayouts[i]!.offset))

    const bytes =
      this.truncateLength === undefined
        ? out
        : out.slice(0, this.truncateLength)
    return { bytes, layout, ifdLayout: (ifd) => ifdMap.get(ifd)! }
  }
}

function valueCount(e: Entry): number {
  const v = e.values
  if (typeof v === 'string') return v.length + 1
  return v.length
}

function encodedLength(e: Entry): number {
  return valueCount(e) * TYPE_INFO[e.type].size
}

function encodeValues(
  e: Entry,
  resolve: (v: Value) => number,
  little: boolean,
): Uint8Array {
  const { values, type } = e
  if (values instanceof Uint8Array) return values
  if (typeof values === 'string') {
    const out = new Uint8Array(values.length + 1)
    for (let i = 0; i < values.length; i++) out[i] = values.charCodeAt(i) & 0xff
    return out
  }
  const size = TYPE_INFO[type].size
  const elem = type === 'RATIONAL' || type === 'SRATIONAL' ? 4 : size
  const out = new Uint8Array(values.length * elem)
  const view = new DataView(out.buffer)
  values.forEach((raw, i) => {
    const n = resolve(raw)
    const at = i * elem
    switch (type) {
      case 'BYTE':
      case 'ASCII':
      case 'UNDEFINED':
        view.setUint8(at, n)
        break
      case 'SBYTE':
        view.setInt8(at, n)
        break
      case 'SHORT':
        view.setUint16(at, n, little)
        break
      case 'SSHORT':
        view.setInt16(at, n, little)
        break
      case 'LONG':
      case 'IFD':
      case 'RATIONAL':
        view.setUint32(at, n, little)
        break
      case 'SLONG':
      case 'SRATIONAL':
        view.setInt32(at, n, little)
        break
      case 'FLOAT':
        view.setFloat32(at, n, little)
        break
      case 'DOUBLE':
        view.setFloat64(at, n, little)
        break
    }
  })
  return out
}

/** Minimal random-access reader over in-memory bytes (to be aligned with the reader interface from #6). */
export interface MemoryReader {
  readonly size: number
  read(offset: number, length: number): Promise<Uint8Array>
}

export function memoryReader(bytes: Uint8Array): MemoryReader {
  return {
    size: bytes.length,
    read: (offset, length) =>
      Promise.resolve(bytes.slice(offset, offset + length)),
  }
}
