import { describe, expect, it } from 'vitest'
import { createMemoryReader } from '../../src/core/io'
import {
  TreeBuilder,
  type ParseResult,
  type Region,
} from '../../src/core/model'
import { applyCoverage, coverageStats } from '../../src/parsers/coverage'
import { parseFile } from '../../src/parsers'
import { describeFixture, fixtureManifest } from '../helpers/fixtures'
import { readFileSync } from 'node:fs'

function build(
  bytes: Uint8Array,
  regions: Array<[number, number, Region['kind']?]>,
): ParseResult {
  const b = new TreeBuilder(bytes.length)
  const root = b.addNode({
    kind: 'file',
    label: 'File',
    offset: 0,
    length: bytes.length,
  })
  regions.forEach(([offset, length, kind], i) => {
    const id = b.addNode({
      kind: 'value',
      label: `r${i}`,
      offset,
      length,
      parentId: root,
    })
    b.addRegion({ nodeId: id, kind: kind ?? 'value', offset, length })
  })
  return b.build()
}

function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0
    return seed / 2 ** 32
  }
}

describe('applyCoverage', () => {
  it('fills gaps so the file is covered exactly once at top level (random)', async () => {
    for (let seed = 1; seed <= 50; seed++) {
      const rand = rng(seed)
      const size = Math.floor(rand() * 200)
      const bytes = new Uint8Array(size).fill(1)
      const regions: Array<[number, number]> = []
      for (let i = 0; i < Math.floor(rand() * 8); i++) {
        const off = Math.floor(rand() * (size + 1))
        regions.push([off, Math.floor(rand() * 40)])
      }
      const original = build(bytes, regions)
      const originals = original.regions.length
      const result = await applyCoverage(createMemoryReader(bytes), original)
      const gaps = result.regions.slice(originals)
      const count = new Uint8Array(size)
      for (const g of gaps)
        for (let i = g.offset; i < g.offset + g.length; i++) count[i]++
      const owned = new Uint8Array(size)
      for (const r of result.regions.slice(0, originals)) {
        for (let i = r.offset; i < Math.min(size, r.offset + r.length); i++)
          owned[i] = 1
      }
      for (let i = 0; i < size; i++) {
        expect(count[i] + owned[i]).toBe(1)
      }
    }
  })

  it('labels short zero gaps as Padding and others as Unknown', async () => {
    const bytes = new Uint8Array([1, 0, 0, 1, 0, 5, 1, 7, 7, 7, 7, 7])
    const result = await applyCoverage(
      createMemoryReader(bytes),
      build(bytes, [
        [0, 1],
        [3, 1],
        [6, 1],
      ]),
    )
    const gapNodes = result.nodes[result.rootId].childIds
      .map((id) => result.nodes[id])
      .filter((n) => n.kind === 'unknown')
    expect(gapNodes.map((n) => [n.offset, n.length, n.label])).toEqual([
      [1, 2, 'Padding'],
      [4, 2, 'Unknown'],
      [7, 5, 'Unknown'],
    ])
    expect(result.nodes[gapNodes[0].id].parentId).toBe(result.rootId)
  })

  it('allows nesting without warnings', async () => {
    const bytes = new Uint8Array(20).fill(1)
    const result = await applyCoverage(
      createMemoryReader(bytes),
      build(bytes, [
        [0, 20, 'makernote'],
        [5, 4],
      ]),
    )
    expect(result.warnings).toEqual([])
    expect(result.regions).toHaveLength(2)
  })

  it('flags partial overlaps on both nodes and in warnings', async () => {
    const bytes = new Uint8Array(20).fill(1)
    const result = await applyCoverage(
      createMemoryReader(bytes),
      build(bytes, [
        [0, 10],
        [5, 10],
      ]),
    )
    const [a, b] = ['n1', 'n2'].map((id) => result.nodes[id])
    expect(a.status).toBe('warning')
    expect(b.status).toBe('warning')
    expect(result.warnings.map((w) => w.nodeId).sort()).toEqual(['n1', 'n2'])
  })

  it('computes stats per kind using innermost region', async () => {
    const bytes = new Uint8Array(100).fill(1)
    const result = await applyCoverage(
      createMemoryReader(bytes),
      build(bytes, [
        [0, 50, 'makernote'],
        [10, 10, 'value'],
        [50, 25, 'raw-data'],
      ]),
    )
    const stats = coverageStats(result)
    expect(stats.makernote.bytes).toBe(40)
    expect(stats.value.bytes).toBe(10)
    expect(stats['raw-data'].bytes).toBe(25)
    expect(stats.unknown.bytes).toBe(25)
    expect(stats.unknown.percent).toBe(25)
  })
})

describe('parseFile coverage', () => {
  it('marks an unrecognised file as one unknown node', async () => {
    const result = await parseFile(
      createMemoryReader(new Uint8Array(10).fill(9)),
    )
    expect(coverageStats(result).unknown.bytes).toBe(10)
  })
})

for (const s of fixtureManifest.samples) {
  describeFixture(s.name, (path) => {
    it('has 100% coverage with no unknown overlap', async () => {
      const result = await parseFile(
        createMemoryReader(new Uint8Array(readFileSync(path))),
      )
      const stats = coverageStats(result)
      const total = Object.values(stats).reduce((n, k) => n + k.bytes, 0)
      expect(total).toBe(result.fileSize)
    })
  })
}
