import { describe, expect, it } from 'vitest'
import {
  buildTagIndex,
  findTagNode,
  normalizeDirectory,
} from '../../src/metadata/tagIndex'
import { TreeBuilder } from '../../src/core/model/tree-builder'

describe('normalizeDirectory', () => {
  it('maps parser and engine names to one name', () => {
    expect(normalizeDirectory('GPSIFD')).toBe('GPS')
    expect(normalizeDirectory('GPS')).toBe('GPS')
    expect(normalizeDirectory('ExifIFD')).toBe('ExifIFD')
    expect(normalizeDirectory('InteropIFD')).toBe('InteropIFD')
    expect(normalizeDirectory('IFD0')).toBe('IFD0')
    expect(normalizeDirectory('IFD1')).toBe('IFD1')
    expect(normalizeDirectory('SubIFD')).toBe('SubIFD')
    expect(normalizeDirectory('SubIFD0')).toBe('SubIFD')
    expect(normalizeDirectory('SubIFD2')).toBe('SubIFD2')
    expect(normalizeDirectory('SubIFD (next 1)')).toBe('SubIFD')
  })

  it('returns null for groups that are not TIFF directories', () => {
    for (const g of ['XMP-dc', 'Composite', 'Canon', 'File', 'MakerNotes'])
      expect(normalizeDirectory(g)).toBeNull()
  })
})

function build() {
  const b = new TreeBuilder(1000)
  const root = b.addNode({ kind: 'file', label: 'f', offset: 0, length: 0 })
  const ifd0 = b.addNode({
    kind: 'ifd',
    label: 'IFD0',
    offset: 8,
    length: 30,
    parentId: root,
  })
  const make = b.addNode({
    kind: 'entry',
    label: 'Make',
    offset: 10,
    length: 12,
    parentId: ifd0,
    details: { tagId: 0x10f, type: 2, count: 1, value: 'x' },
  })
  const gps = b.addNode({
    kind: 'ifd',
    label: 'GPSIFD',
    offset: 100,
    length: 30,
    parentId: ifd0,
  })
  const lat = b.addNode({
    kind: 'entry',
    label: 'GPSLatitude',
    offset: 102,
    length: 12,
    parentId: gps,
    details: { tagId: 2, type: 5, count: 3, value: '1' },
  })
  const sub = b.addNode({
    kind: 'ifd',
    label: 'SubIFD0',
    offset: 200,
    length: 30,
    parentId: ifd0,
  })
  const w = b.addNode({
    kind: 'entry',
    label: 'ImageWidth',
    offset: 202,
    length: 12,
    parentId: sub,
    details: { tagId: 0x100, type: 3, count: 1, value: 1 },
  })
  return { result: b.build(), make, lat, w }
}

describe('tag index', () => {
  it('finds nodes by engine group and tag id', () => {
    const { result, make, lat } = build()
    const idx = buildTagIndex(result)
    expect(
      findTagNode(idx, 'IFD0', { name: 'Make', value: '', tagId: 0x10f }),
    ).toBe(make)
    expect(
      findTagNode(idx, 'GPS', { name: 'GPSLatitude', value: '', tagId: 2 }),
    ).toBe(lat)
  })

  it('falls back to the tag name when the engine gives no tag id', () => {
    const { result, make, w } = build()
    const idx = buildTagIndex(result)
    expect(findTagNode(idx, 'IFD0', { name: 'Make', value: 'x' })).toBe(make)
    expect(findTagNode(idx, 'SubIFD', { name: 'ImageWidth', value: '1' })).toBe(
      w,
    )
  })

  it('has no match for other groups or unknown tags', () => {
    const { result } = build()
    const idx = buildTagIndex(result)
    expect(findTagNode(idx, 'Canon', { name: 'Make', value: '' })).toBeNull()
    expect(findTagNode(idx, 'IFD0', { name: 'Nope', value: '' })).toBeNull()
    expect(
      findTagNode(idx, 'IFD0', { name: 'Make', value: '', tagId: 1 }),
    ).toBeNull()
  })
})
