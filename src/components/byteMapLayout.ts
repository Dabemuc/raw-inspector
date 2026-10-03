import type { Region, RegionKind } from '../core/model'

/** Visible byte window `[start, end)`. */
export interface ByteWindow {
  start: number
  end: number
}

/** A region positioned on the bar, in layout units (0..width). */
export interface Segment {
  nodeId: string
  kind: RegionKind
  offset: number
  length: number
  /** Nesting depth: 0 = top-level, 1 = inside another region, ... */
  depth: number
  x: number
  width: number
}

export interface LayoutOptions {
  /** Smallest drawn segment width in layout units. */
  minWidth?: number
  /** Also emit regions nested inside other regions. */
  showNested?: boolean
}

/** Largest zoom factor (file size / window size). */
export const MAX_ZOOM = 4096

/**
 * Maps regions and a zoom window to segments. Segments narrower than
 * `minWidth` are widened (never beyond the bar) so tiny regions stay visible
 * and clickable. Output is ordered so deeper segments come later (draw on top).
 */
export function layoutSegments(
  regions: Region[],
  window: ByteWindow,
  width: number,
  options: LayoutOptions = {},
): Segment[] {
  const { minWidth = 4, showNested = false } = options
  const span = window.end - window.start
  if (span <= 0 || width <= 0) return []
  const scale = width / span
  const sorted = [...regions]
    .filter((r) => r.length > 0)
    .sort((a, b) => a.offset - b.offset || b.length - a.length)

  const out: Segment[] = []
  const stack: Region[] = []
  for (const r of sorted) {
    while (stack.length > 0) {
      const top = stack[stack.length - 1]
      if (top.offset + top.length <= r.offset) stack.pop()
      else break
    }
    const depth = stack.length
    stack.push(r)
    if (depth > 0 && !showNested) continue
    const end = r.offset + r.length
    if (end <= window.start || r.offset >= window.end) continue
    const x0 = (Math.max(r.offset, window.start) - window.start) * scale
    const x1 = (Math.min(end, window.end) - window.start) * scale
    const w = Math.min(width, Math.max(minWidth, x1 - x0))
    out.push({
      nodeId: r.nodeId,
      kind: r.kind,
      offset: r.offset,
      length: r.length,
      depth,
      x: Math.max(0, Math.min(x0, width - w)),
      width: w,
    })
  }
  return out.sort((a, b) => a.depth - b.depth)
}

function clampWindow(w: ByteWindow, fileSize: number): ByteWindow {
  const minSpan = Math.min(fileSize, Math.max(1, fileSize / MAX_ZOOM))
  const span = Math.min(fileSize, Math.max(minSpan, w.end - w.start))
  const start = Math.max(0, Math.min(w.start, fileSize - span))
  return { start, end: start + span }
}

/** Zooms by `factor` (>1 = in) keeping the byte at fraction `anchor` fixed. */
export function zoomWindow(
  w: ByteWindow,
  fileSize: number,
  factor: number,
  anchor = 0.5,
): ByteWindow {
  const span = w.end - w.start
  const next = span / factor
  const pivot = w.start + span * anchor
  const start = pivot - next * anchor
  return clampWindow({ start, end: start + next }, fileSize)
}

/** Shifts the window by `bytes`, staying inside the file. */
export function panWindow(
  w: ByteWindow,
  fileSize: number,
  bytes: number,
): ByteWindow {
  return clampWindow({ start: w.start + bytes, end: w.end + bytes }, fileSize)
}

/** Window that shows the whole file. */
export function fullWindow(fileSize: number): ByteWindow {
  return { start: 0, end: fileSize }
}
