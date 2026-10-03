import type { RandomAccessReader } from '../core/io'
import type { ParseResult, Region, RegionKind } from '../core/model'

/** Largest all-zero gap that is reported as alignment padding. */
const MAX_PADDING = 3

/** Bytes and share of the file attributed to one region kind. */
export interface KindCoverage {
  bytes: number
  /** Percentage of the file size, 0-100. */
  percent: number
}

const REGION_KINDS: RegionKind[] = [
  'header',
  'ifd',
  'value',
  'raw-data',
  'preview',
  'thumbnail',
  'makernote',
  'unknown',
]

/** Clips a region to the file and drops empty ones. */
function clipped(region: Region, fileSize: number): Region | null {
  const start = Math.max(0, region.offset)
  const end = Math.min(fileSize, region.offset + region.length)
  return end > start
    ? {
        nodeId: region.nodeId,
        kind: region.kind,
        offset: start,
        length: end - start,
      }
    : null
}

function sortedRegions(result: ParseResult): Region[] {
  return result.regions
    .map((r) => clipped(r, result.fileSize))
    .filter((r): r is Region => r !== null)
    .sort((a, b) => a.offset - b.offset || b.length - a.length)
}

function flagNode(result: ParseResult, nodeId: string, message: string): void {
  const node = result.nodes[nodeId]
  if (!node || node.messages.includes(message)) return
  if (node.status === 'ok') node.status = 'warning'
  node.messages.push(message)
  result.warnings.push({ nodeId, message })
}

function describe(result: ParseResult, r: Region): string {
  const label = result.nodes[r.nodeId]?.label ?? r.nodeId
  return `${label} (${r.offset}..${r.offset + r.length})`
}

/**
 * Makes sure every byte of the file is attributed: gaps between regions become
 * `unknown` child nodes of the root (or "Padding" for short zero runs), and
 * partially overlapping regions are flagged with warnings. Nested regions
 * (fully contained in another) are allowed. Mutates and returns `result`.
 */
export async function applyCoverage(
  reader: RandomAccessReader,
  result: ParseResult,
): Promise<ParseResult> {
  const regions = sortedRegions(result)
  const gaps: Array<{ offset: number; length: number }> = []
  const stack: Region[] = []
  const flagged = new Set<string>()
  let coveredEnd = 0

  for (const r of regions) {
    if (r.offset > coveredEnd) {
      gaps.push({ offset: coveredEnd, length: r.offset - coveredEnd })
    }
    while (stack.length > 0) {
      const top = stack[stack.length - 1]
      if (top.offset + top.length <= r.offset) stack.pop()
      else break
    }
    const top = stack[stack.length - 1]
    if (top && r.offset + r.length > top.offset + top.length) {
      const key = `${top.nodeId}|${r.nodeId}`
      if (top.nodeId !== r.nodeId && !flagged.has(key)) {
        flagged.add(key)
        flagNode(
          result,
          top.nodeId,
          `Partially overlaps ${describe(result, r)}`,
        )
        flagNode(
          result,
          r.nodeId,
          `Partially overlaps ${describe(result, top)}`,
        )
      }
    }
    stack.push(r)
    coveredEnd = Math.max(coveredEnd, r.offset + r.length)
  }
  if (coveredEnd < result.fileSize) {
    gaps.push({ offset: coveredEnd, length: result.fileSize - coveredEnd })
  }

  const root = result.nodes[result.rootId]
  let counter = 0
  for (const gap of gaps) {
    let label = 'Unknown'
    if (gap.length <= MAX_PADDING) {
      try {
        const bytes = await reader.read(gap.offset, gap.length)
        if (bytes.length === gap.length && bytes.every((b) => b === 0)) {
          label = 'Padding'
        }
      } catch {
        // unreadable: stays unknown
      }
    }
    let id = `unknown${counter++}`
    while (result.nodes[id]) id = `unknown${counter++}`
    result.nodes[id] = {
      id,
      kind: 'unknown',
      label,
      offset: gap.offset,
      length: gap.length,
      parentId: result.rootId,
      childIds: [],
      status: 'ok',
      messages: [],
    }
    root.childIds.push(id)
    result.regions.push({
      nodeId: id,
      kind: 'unknown',
      offset: gap.offset,
      length: gap.length,
    })
  }
  return result
}

/**
 * Bytes and percentage per region kind. Every byte is attributed to the
 * innermost (smallest) region covering it; uncovered bytes count as unknown.
 */
export function coverageStats(
  result: ParseResult,
): Record<RegionKind, KindCoverage> {
  const bytes = Object.fromEntries(REGION_KINDS.map((k) => [k, 0])) as Record<
    RegionKind,
    number
  >
  const regions = sortedRegions(result)
  const points = new Set<number>([0, result.fileSize])
  for (const r of regions) {
    points.add(r.offset)
    points.add(r.offset + r.length)
  }
  const bounds = [...points].sort((a, b) => a - b)
  let active: Region[] = []
  let next = 0
  for (let i = 0; i < bounds.length - 1; i++) {
    const start = bounds[i]
    const len = bounds[i + 1] - start
    while (next < regions.length && regions[next].offset <= start) {
      active.push(regions[next++])
    }
    active = active.filter((r) => r.offset + r.length > start)
    let best: Region | null = null
    for (const r of active) if (!best || r.length <= best.length) best = r
    bytes[best ? best.kind : 'unknown'] += len
  }
  return Object.fromEntries(
    REGION_KINDS.map((k) => [
      k,
      {
        bytes: bytes[k],
        percent: result.fileSize > 0 ? (bytes[k] / result.fileSize) * 100 : 0,
      },
    ]),
  ) as Record<RegionKind, KindCoverage>
}
