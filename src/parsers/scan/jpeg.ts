import type { RandomAccessReader } from '../../core/io'
import type { ParseResult, Region } from '../../core/model'

/** Candidates smaller than this are treated as false positives. */
const MIN_JPEG_SIZE = 1024
const CHUNK = 64 * 1024
/** A thumbnail side at or below this is labelled a thumbnail. */
const THUMBNAIL_MAX_SIDE = 320

interface FoundJpeg {
  length: number
  width?: number
  height?: number
  truncated: boolean
}

async function readClamped(
  reader: RandomAccessReader,
  offset: number,
  length: number,
): Promise<Uint8Array> {
  const n = Math.min(length, reader.size - offset)
  return n > 0 ? reader.read(offset, n) : new Uint8Array(0)
}

/**
 * Walks a JPEG starting at `start` (at an SOI): length-prefixed segments up to
 * SOS, then entropy-coded data until a real marker (skipping FF00, RSTn and
 * fill bytes). Returns null when the bytes do not form a plausible JPEG.
 */
async function walkJpeg(
  reader: RandomAccessReader,
  start: number,
): Promise<FoundJpeg | null> {
  const size = reader.size
  let pos = start + 2
  let width: number | undefined
  let height: number | undefined
  let sawFrame = false

  for (;;) {
    const head = await readClamped(reader, pos, 4)
    if (head.length < 2) return sawFrame ? truncated() : null
    if (head[0] !== 0xff) return null
    const marker = head[1]!
    if (marker === 0xff) {
      pos++ // fill byte
      continue
    }
    if (marker === 0xd9) {
      return sawFrame ? done(pos + 2) : null
    }
    if (marker === 0 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) {
      if (marker === 0 || marker === 0xd8) return null
      pos += 2
      continue
    }
    if (head.length < 4) return sawFrame ? truncated() : null
    const len = (head[2]! << 8) | head[3]!
    if (len < 2) return null
    const isSof =
      marker >= 0xc0 &&
      marker <= 0xcf &&
      marker !== 0xc4 &&
      marker !== 0xc8 &&
      marker !== 0xcc
    if (isSof) {
      const seg = await readClamped(reader, pos + 4, 5)
      if (seg.length < 5) return truncated()
      if (width === undefined) {
        height = (seg[1]! << 8) | seg[2]!
        width = (seg[3]! << 8) | seg[4]!
      }
      sawFrame = true
    }
    if (pos + 2 + len > size) return sawFrame ? truncated() : null
    pos += 2 + len
    if (marker === 0xda) {
      if (!sawFrame) return null
      const end = await scanEntropy(reader, pos)
      if (end === null) return truncated()
      if (end.eoi) return done(end.pos + 2)
      pos = end.pos // next segment marker (multi-scan)
    }
  }

  function done(end: number): FoundJpeg {
    return { length: end - start, width, height, truncated: false }
  }
  function truncated(): FoundJpeg {
    return { length: size - start, width, height, truncated: true }
  }
}

/**
 * Scans entropy-coded data from `pos` for the next marker that is not a stuffed
 * zero or restart marker. Null when the file ends first.
 */
async function scanEntropy(
  reader: RandomAccessReader,
  from: number,
): Promise<{ pos: number; eoi: boolean } | null> {
  let pos = from
  while (pos < reader.size) {
    const buf = await readClamped(reader, pos, CHUNK)
    let i = buf.indexOf(0xff)
    while (i !== -1) {
      if (i === buf.length - 1) break // marker byte is in the next chunk
      const m = buf[i + 1]!
      if (m === 0xff) {
        i = buf.indexOf(0xff, i + 1)
        continue
      }
      if (m === 0 || (m >= 0xd0 && m <= 0xd7)) {
        i = buf.indexOf(0xff, i + 2)
        continue
      }
      return { pos: pos + i, eoi: m === 0xd9 }
    }
    if (i === -1) pos += buf.length
    else if (pos + i + 1 >= reader.size) return null
    else pos += i
  }
  return null
}

/** Finds candidate `FF D8 FF` offsets inside [start, end), reading in chunks. */
async function* findSoi(
  reader: RandomAccessReader,
  start: number,
  end: number,
): AsyncGenerator<number> {
  let pos = start
  while (pos + 3 <= end) {
    const buf = await readClamped(reader, pos, Math.min(CHUNK, end - pos))
    if (buf.length < 3) return
    let i = buf.indexOf(0xff)
    while (i !== -1 && i + 3 <= buf.length) {
      if (buf[i + 1] === 0xd8 && buf[i + 2] === 0xff) yield pos + i
      i = buf.indexOf(0xff, i + 1)
    }
    if (pos + buf.length >= end) return
    pos += buf.length - 2 // overlap so a signature on the boundary is seen
  }
}

function contains(r: Region, offset: number): boolean {
  return offset >= r.offset && offset < r.offset + r.length
}

/**
 * Looks for JPEGs in unknown and makernote regions (e.g. Sony/Nikon previews
 * referenced only from the MakerNote) and records them as preview nodes. The
 * unknown regions are dropped and coverage is recomputed by `recompute`.
 * Mutates `result`; returns true if anything was found.
 */
export async function scanJpegs(
  reader: RandomAccessReader,
  result: ParseResult,
): Promise<boolean> {
  const ranges = result.regions
    .filter((r) => r.kind === 'unknown' || r.kind === 'makernote')
    .sort((a, b) => a.offset - b.offset)
  const known = result.regions.filter(
    (r) => r.kind === 'preview' || r.kind === 'thumbnail',
  )
  const root = result.nodes[result.rootId]
  let found = false
  let scannedUntil = 0
  let counter = 0

  for (const range of ranges) {
    const end = range.offset + range.length
    for await (const soi of findSoi(
      reader,
      Math.max(range.offset, scannedUntil),
      end,
    )) {
      if (soi < scannedUntil || known.some((k) => contains(k, soi))) continue
      let jpeg: FoundJpeg | null
      try {
        jpeg = await walkJpeg(reader, soi)
      } catch {
        continue
      }
      if (!jpeg || jpeg.length < MIN_JPEG_SIZE) continue
      scannedUntil = soi + jpeg.length
      found = true

      const side = Math.max(jpeg.width ?? 0, jpeg.height ?? 0)
      const kind =
        side > 0 && side <= THUMBNAIL_MAX_SIDE ? 'thumbnail' : 'preview'
      let id = `jpeg${counter++}`
      while (result.nodes[id]) id = `jpeg${counter++}`
      const messages: string[] = []
      if (jpeg.truncated)
        messages.push('JPEG data is truncated (no end marker)')
      result.nodes[id] = {
        id,
        kind,
        label: kind === 'thumbnail' ? 'Embedded thumbnail' : 'Embedded preview',
        offset: soi,
        length: jpeg.length,
        parentId: result.rootId,
        childIds: [],
        status: jpeg.truncated ? 'warning' : 'ok',
        messages,
        details: {
          found: 'scan',
          ...(jpeg.width
            ? { width: jpeg.width, height: jpeg.height ?? 0 }
            : {}),
        },
      }
      root.childIds.push(id)
      const region: Region = {
        nodeId: id,
        kind,
        offset: soi,
        length: jpeg.length,
      }
      result.regions.push(region)
      known.push(region)
      result.previews.push({
        nodeId: id,
        offset: soi,
        length: jpeg.length,
        width: jpeg.width,
        height: jpeg.height,
        mime: 'image/jpeg',
      })
      for (const m of messages) result.warnings.push({ nodeId: id, message: m })
    }
  }
  return found
}

/** Removes unknown nodes/regions so `applyCoverage` can recompute the gaps. */
export function dropUnknownGaps(result: ParseResult): void {
  const root = result.nodes[result.rootId]
  for (const id of [...root.childIds]) {
    if (result.nodes[id]?.kind === 'unknown') {
      delete result.nodes[id]
      root.childIds = root.childIds.filter((c) => c !== id)
    }
  }
  result.regions = result.regions.filter(
    (r) => !(r.kind === 'unknown' && !result.nodes[r.nodeId]),
  )
}
