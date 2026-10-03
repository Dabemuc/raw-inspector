import { describe, expect, it } from 'vitest'
import { createMemoryReader } from '../../src/core/io'
import { parseFile } from '../../src/parsers'

function seg(marker: number, payload: number[]): number[] {
  const len = payload.length + 2
  return [0xff, marker, len >> 8, len & 0xff, ...payload]
}

/** Builds a JPEG with an SOF of w x h, optional APP segment and entropy bytes. */
function jpeg(
  w: number,
  h: number,
  opts: { app?: number[]; entropy?: number; eoi?: boolean } = {},
): number[] {
  const out = [0xff, 0xd8]
  if (opts.app) out.push(...seg(0xe1, opts.app))
  out.push(...seg(0xc0, [8, h >> 8, h & 0xff, w >> 8, w & 0xff, 1, 1, 0x11, 0]))
  out.push(...seg(0xda, [1, 1, 0, 0, 63, 0]))
  for (let i = 0; i < (opts.entropy ?? 2000); i++) {
    out.push(i % 251 === 0 ? 0xff : (i * 7) % 255)
    if (i % 251 === 0) out.push(0x00) // stuffed byte
  }
  out.push(0xff, 0xd0) // RST marker
  if (opts.eoi !== false) out.push(0xff, 0xd9)
  return out
}

function file(...parts: number[][]): Uint8Array {
  return Uint8Array.from(parts.flat())
}

const filler = (n: number, v = 0x55) => new Array<number>(n).fill(v)

describe('fallback JPEG scan', () => {
  it('finds a JPEG in a gap of an unrecognised file', async () => {
    const j = jpeg(1600, 1200)
    const bytes = file(filler(100), j, filler(50))
    const r = await parseFile(createMemoryReader(bytes))
    expect(r.previews).toHaveLength(1)
    expect(r.previews[0]).toMatchObject({
      offset: 100,
      length: j.length,
      width: 1600,
      height: 1200,
    })
    const node = r.nodes[r.previews[0].nodeId]
    expect(node.kind).toBe('preview')
    expect(node.status).toBe('ok')
    // gaps before and after remain explicit unknown nodes
    const unknown = r.regions.filter((x) => x.kind === 'unknown')
    expect(unknown.map((x) => [x.offset, x.length])).toEqual([
      [0, 100],
      [100 + j.length, 50],
    ])
  })

  it('ends at the real EOI when a thumbnail is nested in an APP segment', async () => {
    const thumb = jpeg(160, 120, { entropy: 100 })
    const j = jpeg(2000, 1500, { app: thumb })
    const bytes = file(filler(20), j, filler(30))
    const r = await parseFile(createMemoryReader(bytes))
    expect(r.previews).toHaveLength(1)
    expect(r.previews[0].offset).toBe(20)
    expect(r.previews[0].length).toBe(j.length)
    expect(r.previews[0].width).toBe(2000)
  })

  it('ignores FFD8FF in random data and tiny candidates', async () => {
    const small = jpeg(10, 10, { entropy: 10 })
    const bytes = file(
      filler(50),
      [0xff, 0xd8, 0xff, 0x12, 0x34, 0x56],
      filler(3000, 0xa5),
      small,
    )
    const r = await parseFile(createMemoryReader(bytes))
    expect(r.previews).toHaveLength(0)
  })

  it('reports a truncated JPEG with a warning', async () => {
    const j = jpeg(800, 600, { eoi: false })
    const bytes = file(filler(10), j)
    const r = await parseFile(createMemoryReader(bytes))
    expect(r.previews).toHaveLength(1)
    const node = r.nodes[r.previews[0].nodeId]
    expect(node.status).toBe('warning')
    expect(r.previews[0].offset + r.previews[0].length).toBe(bytes.length)
    expect(r.warnings.some((w) => w.nodeId === node.id)).toBe(true)
  })

  it('finds JPEGs that cross read-chunk boundaries', async () => {
    const j = jpeg(4000, 3000, { entropy: 150_000 })
    const bytes = file(filler(65_530), j, filler(10))
    const r = await parseFile(createMemoryReader(bytes))
    expect(r.previews).toHaveLength(1)
    expect(r.previews[0]).toMatchObject({ offset: 65_530, length: j.length })
  })
})
