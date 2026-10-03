import { ByteView, hex, hex16, hex32 } from '../../core/binary'
import type { RandomAccessReader } from '../../core/io'
import type { TreeBuilder } from '../../core/model'
import type { NodeDetails, NodeStatus, StructureNode } from '../../core/model'
import { summarizeValue, summaryByteLength, tiffTypeInfo } from './values'

const HEADER_SIZE = 8
const ENTRY_SIZE = 12
/** IFDs claiming more entries than this are treated as corrupt. */
export const MAX_IFD_ENTRIES = 1000
/** 42 = TIFF, 0x4F52/0x5352 = Olympus ORF, 0x55 = Panasonic RW2. */
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

  const w = new Walker(reader, builder, rootId, little)
  if (firstIfd === 0) {
    w.report(headerId, 'warning', 'Header has no first IFD (offset 0)')
    return true
  }
  await w.walkChain(firstIfd, 4)
  return true
}

class Walker {
  private readonly visited = new Set<number>()
  private ifdCount = 0
  private readonly reader: RandomAccessReader
  private readonly b: TreeBuilder
  private readonly rootId: string
  private readonly little: boolean
  /** Live node table of the builder (build() returns it by reference). */
  private readonly nodes: Record<string, StructureNode>

  constructor(
    reader: RandomAccessReader,
    b: TreeBuilder,
    rootId: string,
    little: boolean,
  ) {
    this.reader = reader
    this.b = b
    this.rootId = rootId
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
      parentId: this.rootId,
      status: 'broken',
      messages: [message],
      details,
    })
    this.b.addWarning(id, message)
  }

  /**
   * Walks an IFD chain starting at `start`. `pointerAt` is where the pointer
   * to `start` lives (used to locate broken nodes).
   */
  async walkChain(start: number, pointerAt: number): Promise<void> {
    let offset = start
    while (offset !== 0) {
      const label = `IFD${this.ifdCount++}`
      const size = this.reader.size
      if (this.visited.has(offset)) {
        this.brokenIfd(
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
          label,
          pointerAt,
          4,
          `IFD offset ${hex32(offset)} is outside the file (size ${size})`,
          { target: offset },
        )
        return
      }
      this.visited.add(offset)
      const next = await this.walkIfd(label, offset)
      if (next === null) return
      pointerAt = next.pointerAt
      offset = next.offset
    }
  }

  /** Parses one IFD; returns the next-IFD pointer, or null if it was unusable. */
  private async walkIfd(
    label: string,
    offset: number,
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
      this.brokenIfd(label, offset, Math.min(2, size - offset), why, {
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
      parentId: this.rootId,
      details: { entryCount: count },
    })
    this.b.addRegion({ nodeId: ifdId, kind: 'ifd', offset, length })

    for (let i = 0; i < count; i++) {
      await this.walkEntry(ifdId, table, offset, i)
    }
    return { offset: table.u32(length - 4), pointerAt: offset + length - 4 }
  }

  private async walkEntry(
    ifdId: string,
    table: ByteView,
    ifdOffset: number,
    index: number,
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
      label: `Tag ${hex16(tag)}`,
      offset: entryOffset,
      length: ENTRY_SIZE,
      parentId: ifdId,
      details,
    })
    // The builder copies details on insert; keep filling the stored object.
    const stored = this.nodes[entryId]!.details!

    const field = table.bytes(at + 8, 4)
    if (!info) {
      stored.rawValue = Array.from(field, (x) => hex(x)).join(' ')
      this.report(entryId, 'warning', `Unknown field type ${typeCode}`)
      return
    }

    const byteLength = info.size * count
    const inline = byteLength <= 4
    let bytes: Uint8Array
    if (inline) {
      bytes = field
    } else {
      const valueOffset = table.u32(at + 8)
      stored.valueOffset = valueOffset
      if (valueOffset + byteLength > this.reader.size) {
        this.report(
          entryId,
          'broken',
          `Value at ${hex32(valueOffset)} (${byteLength} bytes) extends past the end of the file`,
        )
        return
      }
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
      bytes = await this.reader.read(
        valueOffset,
        summaryByteLength(info.name, info.size, count),
      )
    }
    stored.value = summarizeValue(
      info.name,
      info.size,
      count,
      bytes,
      this.little,
    )
  }
}
