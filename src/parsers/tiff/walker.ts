import { ByteView, hex, hex16, hex32 } from '../../core/binary'
import type { RandomAccessReader } from '../../core/io'
import type { TreeBuilder } from '../../core/model'
import type { NodeDetails, NodeStatus, StructureNode } from '../../core/model'
import {
  classifyImage,
  findJpegSize,
  isJpegCompression,
  mergePieces,
  type ImageClass,
  type ImageProps,
  type Piece,
} from './imageData'
import { formatTagValue, tagName, type TagContext } from './tags'
import {
  decodeValue,
  summarizeValue,
  summaryByteLength,
  tiffTypeInfo,
} from './values'

const HEADER_SIZE = 8
const ENTRY_SIZE = 12
/** IFDs claiming more entries than this are treated as corrupt. */
export const MAX_IFD_ENTRIES = 1000
/** 42 = TIFF, 0x4F52/0x5352 = Olympus ORF, 0x55 = Panasonic RW2. */
/** Safety net against pathological nesting of sub-IFDs. */
export const MAX_IFD_DEPTH = 16
/** Max pointers followed from a single entry (e.g. SubIFDs array). */
const MAX_POINTERS_PER_ENTRY = 64
const TAG_SUBIFDS = 330
const TAG_EXIF_IFD = 34665
const TAG_GPS_IFD = 34853
const TAG_INTEROP_IFD = 40965
const TAG_MAKERNOTE = 37500
const MAKERNOTE_VENDORS: [string, string][] = [
  ['Nikon\0', 'Nikon'],
  ['OLYMPUS\0', 'Olympus'],
  ['OLYMP\0', 'Olympus'],
  ['Panasonic', 'Panasonic'],
  ['SONY DSC', 'Sony'],
  ['SONY CAM', 'Sony'],
  ['LEICA', 'Leica'],
  ['PENTAX \0', 'Pentax'],
  ['AOC\0', 'Pentax'],
  ['Canon', 'Canon'],
]

function guessVendor(bytes: Uint8Array): string | undefined {
  const text = String.fromCharCode(...bytes)
  return MAKERNOTE_VENDORS.find(([sig]) => text.startsWith(sig))?.[1]
}

/** Max numeric array elements read for strip/tile tables. */
const MAX_TABLE_ITEMS = 1 << 16
const TAG_NEW_SUBFILE_TYPE = 254
const TAG_WIDTH = 256
const TAG_HEIGHT = 257
const TAG_BITS_PER_SAMPLE = 258
const TAG_COMPRESSION = 259
const TAG_PHOTOMETRIC = 262
const TAG_STRIP_OFFSETS = 273
const TAG_STRIP_COUNTS = 279
const TAG_TILE_OFFSETS = 324
const TAG_TILE_COUNTS = 325
const TAG_JPEG_OFFSET = 513
const TAG_JPEG_LENGTH = 514

/** A readable entry of the IFD being walked. */
interface TagRef {
  type: string
  size: number
  count: number
  dataOffset: number
  entryId: string
}
type IfdTags = Map<number, TagRef>

const CLASS_NODE = {
  raw: { node: 'image-data', region: 'raw-data', label: 'Raw image data' },
  preview: { node: 'preview', region: 'preview', label: 'Preview' },
  thumbnail: { node: 'thumbnail', region: 'thumbnail', label: 'Thumbnail' },
} as const

const MAGICS = new Set([42, 0x4f52, 0x5352, 0x55])

/**
 * Walks a TIFF-like file, adding header/IFD/entry/value nodes under `rootId`.
 * Returns false (adding nothing) if the file does not look like TIFF.
 * Never throws for malformed content; problems become broken/warning nodes.
 */
export async function walkTiff(
  reader: RandomAccessReader,
  builder: TreeBuilder,
  rootId: string,
): Promise<boolean> {
  if (reader.size < HEADER_SIZE) return false
  const head = await reader.read(0, HEADER_SIZE)
  const order = String.fromCharCode(head[0]!, head[1]!)
  if (order !== 'II' && order !== 'MM') return false
  const little = order === 'II'
  const hv = new ByteView(head, little)
  const magic = hv.u16(2)
  if (!MAGICS.has(magic)) return false
  const firstIfd = hv.u32(4)

  const headerId = builder.addNode({
    kind: 'header',
    label: 'TIFF Header',
    offset: 0,
    length: HEADER_SIZE,
    parentId: rootId,
    details: {
      byteOrder: order,
      magic,
      magicHex: hex16(magic),
      firstIfdOffset: firstIfd,
    },
  })
  builder.addRegion({
    nodeId: headerId,
    kind: 'header',
    offset: 0,
    length: HEADER_SIZE,
  })

  const w = new Walker(reader, builder, little)
  if (firstIfd === 0) {
    w.report(headerId, 'warning', 'Header has no first IFD (offset 0)')
    return true
  }
  await w.walkChain(firstIfd, 4, rootId, 0, 'tiff')
  return true
}

class Walker {
  private readonly visited = new Set<number>()
  private ifdCount = 0
  private readonly reader: RandomAccessReader
  private readonly b: TreeBuilder
  private readonly little: boolean
  /** Live node table of the builder (build() returns it by reference). */
  private readonly nodes: Record<string, StructureNode>

  constructor(reader: RandomAccessReader, b: TreeBuilder, little: boolean) {
    this.reader = reader
    this.b = b
    this.little = little
    this.nodes = b.build().nodes
  }

  /** Marks a node's status/message and mirrors it into the result warnings. */
  report(nodeId: string, status: NodeStatus, message: string): void {
    const node = this.nodes[nodeId]!
    node.messages.push(message)
    if (node.status !== 'broken') node.status = status
    this.b.addWarning(nodeId, message)
  }

  private brokenIfd(
    parentId: string,
    label: string,
    offset: number,
    length: number,
    message: string,
    details?: NodeDetails,
  ): void {
    const id = this.b.addNode({
      kind: 'ifd',
      label,
      offset,
      length,
      parentId,
      status: 'broken',
      messages: [message],
      details,
    })
    this.b.addWarning(id, message)
  }

  /**
   * Walks an IFD chain starting at `start`. `pointerAt` is where the pointer
   * to `start` lives (used to locate broken nodes). IFD nodes become children
   * of `parentId`; `name` labels sub-IFDs (top-level chains are IFD0, IFD1, …).
   */
  async walkChain(
    start: number,
    pointerAt: number,
    parentId: string,
    depth: number,
    context: TagContext,
    name?: string,
  ): Promise<void> {
    let offset = start
    let k = 0
    while (offset !== 0) {
      const label =
        name === undefined
          ? `IFD${this.ifdCount++}`
          : k === 0
            ? name
            : `${name} (next ${k})`
      k++
      const size = this.reader.size
      if (depth > MAX_IFD_DEPTH) {
        this.brokenIfd(
          parentId,
          label,
          pointerAt,
          4,
          `IFD nesting deeper than ${MAX_IFD_DEPTH} levels`,
          { target: offset },
        )
        return
      }
      if (this.visited.has(offset)) {
        this.brokenIfd(
          parentId,
          label,
          pointerAt,
          4,
          `Loop detected: IFD at ${hex32(offset)} was already visited`,
          { target: offset },
        )
        return
      }
      if (offset < HEADER_SIZE || offset + 2 > size) {
        this.brokenIfd(
          parentId,
          label,
          pointerAt,
          4,
          `IFD offset ${hex32(offset)} is outside the file (size ${size})`,
          { target: offset },
        )
        return
      }
      this.visited.add(offset)
      const next = await this.walkIfd(label, offset, parentId, depth, context)
      if (next === null) return
      pointerAt = next.pointerAt
      offset = next.offset
    }
  }

  /** Parses one IFD; returns the next-IFD pointer, or null if it was unusable. */
  private async walkIfd(
    label: string,
    offset: number,
    parentId: string,
    depth: number,
    context: TagContext,
  ): Promise<{ offset: number; pointerAt: number } | null> {
    const size = this.reader.size
    const count = new ByteView(
      await this.reader.read(offset, 2),
      this.little,
    ).u16(0)
    const length = 2 + count * ENTRY_SIZE + 4
    if (count > MAX_IFD_ENTRIES || offset + length > size) {
      const why =
        count > MAX_IFD_ENTRIES
          ? `IFD claims ${count} entries (limit ${MAX_IFD_ENTRIES})`
          : `IFD with ${count} entries extends past the end of the file`
      this.brokenIfd(parentId, label, offset, Math.min(2, size - offset), why, {
        entryCount: count,
      })
      return null
    }

    const table = new ByteView(
      await this.reader.read(offset, length),
      this.little,
    )
    const ifdId = this.b.addNode({
      kind: 'ifd',
      label,
      offset,
      length,
      parentId,
      details: { entryCount: count },
    })
    this.b.addRegion({ nodeId: ifdId, kind: 'ifd', offset, length })

    const tags: IfdTags = new Map()
    for (let i = 0; i < count; i++) {
      await this.walkEntry(ifdId, table, offset, i, depth, tags, context)
    }
    await this.addImageData(ifdId, label, tags)
    return { offset: table.u32(length - 4), pointerAt: offset + length - 4 }
  }

  private async walkEntry(
    ifdId: string,
    table: ByteView,
    ifdOffset: number,
    index: number,
    depth: number,
    tags: IfdTags,
    context: TagContext,
  ): Promise<void> {
    const at = 2 + index * ENTRY_SIZE
    const entryOffset = ifdOffset + at
    const tag = table.u16(at)
    const typeCode = table.u16(at + 2)
    const count = table.u32(at + 4)
    const info = tiffTypeInfo(typeCode)
    const details: NodeDetails = {
      tagId: tag,
      tagHex: hex16(tag),
      typeId: typeCode,
      type: info?.name ?? `Unknown (${typeCode})`,
      count,
    }
    const entryId = this.b.addNode({
      kind: 'entry',
      label: tagName(context, tag),
      offset: entryOffset,
      length: ENTRY_SIZE,
      parentId: ifdId,
      details,
    })
    // The builder copies details on insert; keep filling the stored object.
    const stored = this.nodes[entryId]!.details!

    const field = table.bytes(at + 8, 4)
    if (!info) {
      stored.raw = Array.from(field, (x) => hex(x)).join(' ')
      this.report(entryId, 'warning', `Unknown field type ${typeCode}`)
      return
    }

    const byteLength = info.size * count
    const inline = byteLength <= 4
    const isMakerNote = tag === TAG_MAKERNOTE
    let bytes: Uint8Array
    let dataOffset = entryOffset + 8
    if (inline) {
      bytes = field
    } else {
      const valueOffset = table.u32(at + 8)
      stored.valueOffset = valueOffset
      dataOffset = valueOffset
      if (valueOffset + byteLength > this.reader.size) {
        this.report(
          entryId,
          'broken',
          `Value at ${hex32(valueOffset)} (${byteLength} bytes) extends past the end of the file`,
        )
        return
      }
      if (!isMakerNote) {
        const valueId = this.b.addNode({
          kind: 'value',
          label: `${this.nodes[entryId]!.label} value`,
          offset: valueOffset,
          length: byteLength,
          parentId: entryId,
          details: { byteLength },
        })
        this.b.addRegion({
          nodeId: valueId,
          kind: 'value',
          offset: valueOffset,
          length: byteLength,
        })
      }
      bytes = await this.reader.read(
        valueOffset,
        summaryByteLength(info.name, info.size, count),
      )
    }
    const raw = summarizeValue(info.name, info.size, count, bytes, this.little)
    stored.raw = raw
    stored.value =
      formatTagValue(
        context,
        tag,
        decodeValue(info.name, info.size, count, bytes, this.little),
      ) ?? raw

    if (!isMakerNote) {
      tags.set(tag, {
        type: info.name,
        size: info.size,
        count,
        dataOffset,
        entryId,
      })
    }
    if (isMakerNote) {
      await this.addMakerNote(entryId, dataOffset, byteLength)
      return
    }
    const subName = this.subIfdName(tag)
    if (subName !== undefined || info.name === 'IFD') {
      if (info.name !== 'LONG' && info.name !== 'IFD') return
      await this.descend(entryId, tag, subName, dataOffset, count, depth)
    }
  }

  private subIfdContext(tag: number): TagContext {
    switch (tag) {
      case TAG_EXIF_IFD:
        return 'exif'
      case TAG_GPS_IFD:
        return 'gps'
      case TAG_INTEROP_IFD:
        return 'interop'
    }
    return 'tiff'
  }

  private subIfdName(tag: number): string | undefined {
    switch (tag) {
      case TAG_SUBIFDS:
        return 'SubIFD'
      case TAG_EXIF_IFD:
        return 'ExifIFD'
      case TAG_GPS_IFD:
        return 'GPSIFD'
      case TAG_INTEROP_IFD:
        return 'InteropIFD'
    }
    return undefined
  }

  /** Walks every IFD pointer of an entry as children of that entry. */
  private async descend(
    entryId: string,
    tag: number,
    subName: string | undefined,
    dataOffset: number,
    count: number,
    depth: number,
  ): Promise<void> {
    const n = Math.min(count, MAX_POINTERS_PER_ENTRY)
    const ptrs = new ByteView(
      await this.reader.read(dataOffset, n * 4),
      this.little,
    )
    for (let i = 0; i < n; i++) {
      const target = ptrs.u32(i * 4)
      if (target === 0) continue
      const base = subName ?? `IFD ${hex16(tag)}`
      const name = tag === TAG_SUBIFDS || count > 1 ? `${base}${i}` : base
      await this.walkChain(
        target,
        dataOffset + i * 4,
        entryId,
        depth + 1,
        this.subIfdContext(tag),
        name,
      )
    }
    if (count > n) {
      this.report(
        entryId,
        'warning',
        `Only the first ${n} of ${count} IFD pointers were followed`,
      )
    }
  }

  private async addMakerNote(
    entryId: string,
    offset: number,
    length: number,
  ): Promise<void> {
    const head = await this.reader.read(offset, Math.min(16, length))
    const details: NodeDetails = {
      byteLength: length,
      firstBytes: Array.from(head, (x) =>
        x.toString(16).toUpperCase().padStart(2, '0'),
      ).join(' '),
    }
    const vendor = guessVendor(head)
    if (vendor) details.vendor = vendor
    const id = this.b.addNode({
      kind: 'makernote',
      label: 'MakerNote',
      offset,
      length,
      parentId: entryId,
      details,
    })
    this.b.addRegion({ nodeId: id, kind: 'makernote', offset, length })
  }

  /** Reads an integer tag array (BYTE/SHORT/LONG), capped at MAX_TABLE_ITEMS. */
  private async numbers(
    ref: TagRef | undefined,
  ): Promise<number[] | undefined> {
    if (!ref || !['BYTE', 'SHORT', 'LONG', 'IFD'].includes(ref.type)) return
    const n = Math.min(ref.count, MAX_TABLE_ITEMS)
    const view = new ByteView(
      await this.reader.read(ref.dataOffset, n * ref.size),
      this.little,
    )
    const out: number[] = []
    for (let i = 0; i < n; i++) {
      out.push(
        ref.size === 1
          ? view.u8(i)
          : ref.size === 2
            ? view.u16(i * 2)
            : view.u32(i * 4),
      )
    }
    if (ref.count > n) {
      this.report(
        ref.entryId,
        'warning',
        `Only the first ${n} of ${ref.count} values were read`,
      )
    }
    return out
  }

  /** Pairs offset/length tags of an IFD into image data nodes and regions. */
  private async addImageData(
    ifdId: string,
    ifdLabel: string,
    tags: IfdTags,
  ): Promise<void> {
    const first = async (tag: number) =>
      (await this.numbers(tags.get(tag)))?.[0]
    const props: ImageProps = {
      newSubfileType: await first(TAG_NEW_SUBFILE_TYPE),
      compression: await first(TAG_COMPRESSION),
      photometric: await first(TAG_PHOTOMETRIC),
      bitsPerSample: await this.numbers(tags.get(TAG_BITS_PER_SAMPLE)),
      width: await first(TAG_WIDTH),
      height: await first(TAG_HEIGHT),
    }

    const groups: [string, number, number][] = [
      ['Strip', TAG_STRIP_OFFSETS, TAG_STRIP_COUNTS],
      ['Tile', TAG_TILE_OFFSETS, TAG_TILE_COUNTS],
    ]
    for (const [unit, offTag, lenTag] of groups) {
      const offRef = tags.get(offTag)
      const lenRef = tags.get(lenTag)
      if (!offRef && !lenRef) continue
      const offsets = await this.numbers(offRef)
      const lengths = await this.numbers(lenRef)
      if (!offsets || !lengths) {
        this.report(
          (offRef ?? lenRef)!.entryId,
          'warning',
          `${unit} offsets and byte counts must both be present and numeric`,
        )
        continue
      }
      if (offsets.length !== lengths.length) {
        this.report(
          offRef!.entryId,
          'warning',
          `${unit} offsets (${offsets.length}) and byte counts (${lengths.length}) differ in length`,
        )
      }
      const pieces = offsets
        .slice(0, lengths.length)
        .map((offset, i) => ({ offset, length: lengths[i]! }))
      await this.emitImage(ifdId, ifdLabel, unit, pieces, props, false)
    }

    const jpegOff = tags.get(TAG_JPEG_OFFSET)
    if (jpegOff) {
      const offset = (await this.numbers(jpegOff))?.[0]
      const length = await first(TAG_JPEG_LENGTH)
      if (offset === undefined || length === undefined) {
        this.report(
          jpegOff.entryId,
          'warning',
          'JPEGInterchangeFormat needs a numeric JPEGInterchangeFormatLength',
        )
      } else {
        await this.emitImage(
          ifdId,
          ifdLabel,
          'JPEG',
          [{ offset, length }],
          { ...props, compression: undefined, interchangeJpeg: true },
          true,
        )
      }
    }
  }

  private async emitImage(
    ifdId: string,
    ifdLabel: string,
    unit: string,
    pieces: Piece[],
    props: ImageProps,
    interchange: boolean,
  ): Promise<void> {
    const size = this.reader.size
    const valid: Piece[] = []
    const problems: { piece: Piece; index: number }[] = []
    pieces.forEach((p, index) => {
      if (p.length === 0) return
      if (p.offset + p.length > size) problems.push({ piece: p, index })
      else valid.push(p)
    })
    if (valid.length === 0 && problems.length === 0) return

    const jpeg = isJpegCompression(props)
    let width = props.width
    let height = props.height
    const merged = mergePieces(valid)
    // Reading the JPEG start serves the FFD8 check and the SOF fallback.
    const jpegStart = valid.length
      ? [...valid].sort((a, b) => a.offset - b.offset)[0]!
      : undefined
    let head: Uint8Array | undefined
    if (jpeg && jpegStart && (interchange || merged.length === 1)) {
      head = await this.reader.read(
        jpegStart.offset,
        Math.min(jpegStart.length, 65536),
      )
      if (width === undefined || height === undefined) {
        const sof = findJpegSize(head)
        if (sof) ({ width, height } = sof)
      }
    }
    const cls: ImageClass = classifyImage({ ...props, width, height })
    const meta = CLASS_NODE[cls]
    const total = valid.reduce((n, p) => n + p.length, 0)
    const start = valid.length
      ? Math.min(...valid.map((p) => p.offset))
      : Math.min(...problems.map((p) => p.piece.offset))
    const details: NodeDetails = {
      pieceKind: unit,
      pieceCount: pieces.length,
      byteLength: total,
    }
    const set = (k: string, v: number | undefined) => {
      if (v !== undefined) details[k] = v
    }
    set('width', width)
    set('height', height)
    set('compression', props.compression)
    set('photometric', props.photometric)
    set('newSubfileType', props.newSubfileType)
    if (props.bitsPerSample)
      details.bitsPerSample = props.bitsPerSample.join(',')
    const nodeId = this.b.addNode({
      kind: meta.node,
      label: `${ifdLabel} ${meta.label}`,
      offset: start,
      length: total,
      parentId: ifdId,
      details,
    })
    for (const [i, p] of pieces.entries()) {
      if (p.length === 0) continue
      const bad = p.offset + p.length > size
      const id = this.b.addNode({
        kind: meta.node,
        label: unit === 'JPEG' ? 'JPEG data' : `${unit} ${i}`,
        offset: p.offset,
        length: p.length,
        parentId: nodeId,
      })
      if (bad) {
        this.report(
          id,
          'broken',
          `${unit} data at ${hex32(p.offset)} (${p.length} bytes) extends past the end of the file`,
        )
      }
    }
    for (const r of merged) {
      this.b.addRegion({
        nodeId,
        kind: meta.region,
        offset: r.offset,
        length: r.length,
      })
    }
    if (problems.length > 0) {
      this.report(
        nodeId,
        'warning',
        `${problems.length} ${unit.toLowerCase()} range(s) lie past the end of the file`,
      )
    }

    if (head && cls !== 'raw') {
      if (head[0] !== 0xff || head[1] !== 0xd8) {
        this.report(nodeId, 'warning', 'JPEG data does not start with FFD8')
      }
      if (merged.length === 1) {
        const [r] = merged
        const preview = {
          nodeId,
          offset: r!.offset,
          length: r!.length,
          mime: 'image/jpeg' as const,
          ...(width !== undefined && { width }),
          ...(height !== undefined && { height }),
        }
        this.b.addPreview(preview)
      }
    }
  }
}
