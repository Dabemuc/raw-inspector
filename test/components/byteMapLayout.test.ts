import { describe, expect, it } from 'vitest'
import {
  fullWindow,
  layoutSegments,
  panWindow,
  zoomWindow,
} from '../../src/components/byteMapLayout'
import type { Region } from '../../src/core/model'

const r = (nodeId: string, offset: number, length: number): Region => ({
  nodeId,
  kind: 'value',
  offset,
  length,
})

describe('layoutSegments', () => {
  it('scales regions proportionally over the full window', () => {
    const segs = layoutSegments(
      [r('a', 0, 250), r('b', 250, 750)],
      fullWindow(1000),
      1000,
    )
    expect(segs.map((s) => [s.nodeId, s.x, s.width])).toEqual([
      ['a', 0, 250],
      ['b', 250, 750],
    ])
  })

  it('enforces the minimum width', () => {
    const [s] = layoutSegments([r('a', 500, 1)], fullWindow(100000), 1000, {
      minWidth: 4,
    })
    expect(s.width).toBe(4)
  })

  it('keeps min-width segments inside the bar', () => {
    const [s] = layoutSegments([r('a', 99999, 1)], fullWindow(100000), 1000, {
      minWidth: 4,
    })
    expect(s.x + s.width).toBeLessThanOrEqual(1000)
  })

  it('hides nested regions unless requested', () => {
    const regions = [r('outer', 0, 500), r('inner', 100, 50)]
    const flat = layoutSegments(regions, fullWindow(1000), 1000)
    expect(flat.map((s) => s.nodeId)).toEqual(['outer'])
    const nested = layoutSegments(regions, fullWindow(1000), 1000, {
      showNested: true,
    })
    expect(nested.map((s) => [s.nodeId, s.depth])).toEqual([
      ['outer', 0],
      ['inner', 1],
    ])
  })

  it('culls regions outside the window and clips partial ones', () => {
    const segs = layoutSegments(
      [r('a', 0, 100), r('b', 150, 100), r('c', 400, 100)],
      { start: 100, end: 300 },
      1000,
    )
    expect(segs.map((s) => s.nodeId)).toEqual(['b'])
    expect(segs[0].x).toBe(250)
    const clipped = layoutSegments(
      [r('a', 0, 150)],
      { start: 100, end: 300 },
      200,
    )
    expect(clipped[0]).toMatchObject({ x: 0, width: 50 })
  })

  it('returns nothing for an empty window', () => {
    expect(layoutSegments([r('a', 0, 10)], { start: 5, end: 5 }, 100)).toEqual(
      [],
    )
  })
})

describe('zoomWindow / panWindow', () => {
  it('zooms around the anchor', () => {
    expect(zoomWindow(fullWindow(1000), 1000, 2, 0)).toEqual({
      start: 0,
      end: 500,
    })
    expect(zoomWindow(fullWindow(1000), 1000, 2, 1)).toEqual({
      start: 500,
      end: 1000,
    })
  })

  it('never zooms out beyond the file', () => {
    expect(zoomWindow({ start: 0, end: 500 }, 1000, 0.1)).toEqual(
      fullWindow(1000),
    )
  })

  it('clamps panning to the file', () => {
    expect(panWindow({ start: 100, end: 200 }, 1000, -500)).toEqual({
      start: 0,
      end: 100,
    })
    expect(panWindow({ start: 100, end: 200 }, 1000, 5000)).toEqual({
      start: 900,
      end: 1000,
    })
  })
})
