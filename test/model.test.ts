import { describe, expect, it } from 'vitest'
import {
  TreeBuilder,
  ancestorsOf,
  exampleResult,
  findSmallestNodeAt,
} from '../src/core/model'

function small() {
  const b = new TreeBuilder(100)
  const root = b.addNode({ kind: 'file', label: 'f', offset: 0, length: 100 })
  const ifd = b.addNode({
    kind: 'ifd',
    label: 'IFD',
    offset: 10,
    length: 50,
    parentId: root,
  })
  const entry = b.addNode({
    kind: 'entry',
    label: 'E',
    offset: 12,
    length: 12,
    parentId: ifd,
  })
  return { r: b.build(), root, ifd, entry }
}

describe('TreeBuilder', () => {
  it('generates unique ids and links parents and children', () => {
    const { r, root, ifd, entry } = small()
    expect(new Set([root, ifd, entry]).size).toBe(3)
    expect(r.rootId).toBe(root)
    expect(r.nodes[root].childIds).toEqual([ifd])
    expect(r.nodes[entry].parentId).toBe(ifd)
    expect(r.nodes[entry].status).toBe('ok')
    expect(r.nodes[entry].messages).toEqual([])
  })

  it('does not propagate status', () => {
    const b = new TreeBuilder(10)
    const root = b.addNode({ kind: 'file', label: 'f', offset: 0, length: 10 })
    b.addNode({
      kind: 'entry',
      label: 'x',
      offset: 0,
      length: 1,
      parentId: root,
      status: 'broken',
    })
    expect(b.build().nodes[root].status).toBe('ok')
  })

  it('rejects unknown parents, second roots, and missing root', () => {
    const b = new TreeBuilder(10)
    expect(() => b.build()).toThrow()
    expect(() =>
      b.addNode({
        kind: 'ifd',
        label: 'x',
        offset: 0,
        length: 1,
        parentId: 'nope',
      }),
    ).toThrow()
    b.addNode({ kind: 'file', label: 'f', offset: 0, length: 10 })
    expect(() =>
      b.addNode({ kind: 'file', label: 'g', offset: 0, length: 1 }),
    ).toThrow()
  })

  it('collects regions, previews, warnings and format', () => {
    const b = new TreeBuilder(10)
    const root = b.addNode({ kind: 'file', label: 'f', offset: 0, length: 10 })
    b.addRegion({ nodeId: root, kind: 'unknown', offset: 0, length: 10 })
    b.addPreview({ nodeId: root, offset: 0, length: 5, mime: 'image/jpeg' })
    b.addWarning(null, 'w')
    b.setFormat({ id: 'x', name: 'X' })
    const r = b.build()
    expect(r.regions).toHaveLength(1)
    expect(r.previews).toHaveLength(1)
    expect(r.warnings).toEqual([{ nodeId: null, message: 'w' }])
    expect(r.format?.id).toBe('x')
    expect(() =>
      b.addRegion({ nodeId: 'zz', kind: 'ifd', offset: 0, length: 1 }),
    ).toThrow()
  })
})

describe('findSmallestNodeAt', () => {
  it('returns the innermost node covering the offset', () => {
    const { r, root, ifd, entry } = small()
    expect(findSmallestNodeAt(r, 13)?.id).toBe(entry)
    expect(findSmallestNodeAt(r, 30)?.id).toBe(ifd)
    expect(findSmallestNodeAt(r, 90)?.id).toBe(root)
  })

  it('treats end offset as exclusive and returns null outside', () => {
    const { r, ifd } = small()
    expect(findSmallestNodeAt(r, 60)?.id).not.toBe(ifd)
    expect(findSmallestNodeAt(r, 100)).toBeNull()
  })

  it('works on the example', () => {
    expect(findSmallestNodeAt(exampleResult, 3500)?.kind).toBe('unknown')
    expect(findSmallestNodeAt(exampleResult, 0)?.kind).toBe('header')
  })
})

describe('ancestorsOf', () => {
  it('lists parent first up to root', () => {
    const { r, root, ifd, entry } = small()
    expect(ancestorsOf(r, entry).map((n) => n.id)).toEqual([ifd, root])
    expect(ancestorsOf(r, root)).toEqual([])
    expect(ancestorsOf(r, 'missing')).toEqual([])
  })
})

describe('exampleResult', () => {
  it('survives structuredClone unchanged', () => {
    expect(structuredClone(exampleResult)).toEqual(exampleResult)
  })

  it('is internally consistent', () => {
    for (const n of Object.values(exampleResult.nodes)) {
      for (const c of n.childIds)
        expect(exampleResult.nodes[c].parentId).toBe(n.id)
    }
    expect(exampleResult.previews[0].nodeId in exampleResult.nodes).toBe(true)
  })
})
