import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { createMemoryReader } from '../../src/core/io'
import type { ParseResult, StructureNode } from '../../src/core/model'
import { parseFile } from '../../src/parsers'
import {
  blobLength,
  blobOffset,
  ifdOffset,
  TiffBuilder,
  type TiffType,
} from '../helpers/tiffBuilder'

const parse = (bytes: Uint8Array) => parseFile(createMemoryReader(bytes))
const nodesOf = (r: ParseResult, kind: string): StructureNode[] =>
  Object.values(r.nodes).filter((n) => n.kind === kind)

describe('parseFile non-TIFF', () => {
  it('returns root + unknown region', async () => {
    const r = await parse(new Uint8Array(32).fill(7))
    expect(Object.keys(r.nodes)).toHaveLength(2)
    expect(r.nodes[r.rootId]!.kind).toBe('file')
    const unknown = nodesOf(r, 'unknown')[0]!
    expect(unknown.parentId).toBe(r.rootId)
    expect(r.regions).toEqual([
      { nodeId: unknown.id, kind: 'unknown', offset: 0, length: 32 },
    ])
  })

  it('handles empty and tiny files', async () => {
    expect((await parse(new Uint8Array(0))).regions).toEqual([])
    expect(Object.keys((await parse(Uint8Array.of(0x49))).nodes)).toHaveLength(
      2,
    )
  })

  it('rejects unknown magic', async () => {
    const { bytes } = new TiffBuilder({ magic: 43 }).build()
    expect(nodesOf(await parse(bytes), 'header')).toHaveLength(0)
  })
})

describe.each(['II', 'MM'] as const)('byte order %s', (byteOrder) => {
  it('parses header and IFD layout exactly', async () => {
    const t = new TiffBuilder({ byteOrder })
    t.ifd().entry(0x100, 'SHORT', [640]).entry(0x10f, 'ASCII', 'Camera Make')
    const built = t.build()
    const r = await parse(built.bytes)

    const [header] = nodesOf(r, 'header')
    expect(header).toMatchObject({ offset: 0, length: 8 })
    expect(header!.details).toMatchObject({ byteOrder, magic: 42 })

    const il = built.layout.ifds[0]!
    const [ifd] = nodesOf(r, 'ifd')
    expect(ifd).toMatchObject({
      label: 'IFD0',
      offset: il.offset,
      length: il.nextPointerOffset + 4 - il.offset,
      status: 'ok',
    })
    const entries = nodesOf(r, 'entry')
    expect(entries.map((e) => e.offset)).toEqual(
      il.entries.map((e) => e.entryOffset),
    )
    expect(entries[0]!.details).toMatchObject({
      tagId: 0x100,
      type: 'SHORT',
      count: 1,
      value: '640',
    })
    expect(entries[1]!.details!.value).toBe('"Camera Make"')
    const [value] = nodesOf(r, 'value')
    expect(value).toMatchObject({
      offset: il.entries[1]!.valueOffset,
      length: il.entries[1]!.byteLength,
      parentId: entries[1]!.id,
    })
    expect(r.regions.map((x) => [x.kind, x.offset, x.length])).toEqual([
      ['header', 0, 8],
      ['ifd', ifd!.offset, ifd!.length],
      ['value', value!.offset, value!.length],
    ])
  })

  const cases: [TiffType, number[], number[], string, string][] = [
    ['BYTE', [200], [1, 2, 3, 4, 5, 6], '200', '1, 2, 3, 4, 5, 6'],
    ['SBYTE', [-5], [-1, -2, -3, -4, -5], '-5', '-1, -2, -3, -4, -5'],
    ['UNDEFINED', [0xab], [1, 2, 0xff, 4, 5], 'AB', '01 02 FF 04 05'],
    ['SHORT', [65535], [1, 2, 3], '65535', '1, 2, 3'],
    ['SSHORT', [-2], [-1, -2, -3], '-2', '-1, -2, -3'],
    ['LONG', [4000000000], [1, 2], '4000000000', '1, 2'],
    ['SLONG', [-70000], [-1, 2], '-70000', '-1, 2'],
    ['IFD', [16], [16, 32], '0x00000010', '0x00000010, 0x00000020'],
    ['RATIONAL', [1, 3], [1, 2, 3, 4], '1/3', '1/2, 3/4'],
    ['SRATIONAL', [-1, 3], [-1, 2, 3, -4], '-1/3', '-1/2, 3/-4'],
    ['FLOAT', [1.5], [1.5, -2.25], '1.5', '1.5, -2.25'],
    ['DOUBLE', [0.125], [0.125, 3], '0.125', '0.125, 3'],
  ]
  it.each(cases)('%s inline and out-of-line', async (type, one, many, a, b) => {
    const t = new TiffBuilder({ byteOrder })
    t.ifd().entry(1, type, one).entry(2, type, many)
    const built = t.build()
    const r = await parse(built.bytes)
    // Type-13 values are followed as IFD pointers; only look at IFD0's entries.
    const ifd0 = nodesOf(r, 'ifd')[0]!
    const entries = nodesOf(r, 'entry').filter((e) => e.parentId === ifd0.id)
    expect(entries[0]!.details).toMatchObject({ type, value: a })
    expect(entries[1]!.details).toMatchObject({ type, value: b })
    const il = built.layout.ifds[0]!
    // Inline iff the builder placed it inline; out-of-line entries get a value node.
    const values = nodesOf(r, 'value')
    const expected = il.entries.filter((e) => !e.inline)
    expect(values.map((v) => [v.offset, v.length])).toEqual(
      expected.map((e) => [e.valueOffset, e.byteLength]),
    )
    expect(r.nodes[entries[0]!.id]!.status).toBe('ok')
  })
})

describe.each([
  ['TIFF', 42],
  ['ORF', 0x4f52],
  ['ORF2', 0x5352],
  ['RW2', 0x55],
])('magic %s', (_name, magic) => {
  it('is accepted', async () => {
    const t = new TiffBuilder({ magic })
    t.ifd().entry(1, 'SHORT', [1])
    const r = await parse(t.build().bytes)
    expect(nodesOf(r, 'header')[0]!.details!.magic).toBe(magic)
    expect(nodesOf(r, 'ifd')).toHaveLength(1)
  })
})

describe('IFD chain', () => {
  it('walks three IFDs and labels them', async () => {
    const t = new TiffBuilder()
    const a = t.ifd().entry(1, 'SHORT', [1])
    const b = t.ifd().entry(2, 'SHORT', [2]).entry(3, 'LONG', [1, 2, 3])
    const c = t.ifd()
    a.nextIfd(b)
    b.nextIfd(c)
    const built = t.build()
    const r = await parse(built.bytes)
    const ifds = nodesOf(r, 'ifd')
    expect(ifds.map((i) => i.label)).toEqual(['IFD0', 'IFD1', 'IFD2'])
    expect(ifds.map((i) => i.offset)).toEqual(
      built.layout.ifds.map((i) => i.offset),
    )
    expect(ifds.every((i) => i.status === 'ok')).toBe(true)
    expect(ifds[2]!.length).toBe(6)
  })

  it('truncates long arrays in the summary', async () => {
    const t = new TiffBuilder()
    t.ifd().entry(
      1,
      'SHORT',
      Array.from({ length: 40 }, (_, i) => i),
    )
    const r = await parse(t.build().bytes)
    const e = nodesOf(r, 'entry')[0]!
    expect(e.details!.count).toBe(40)
    expect(e.details!.value).toMatch(/^0, 1, .*, 15, … \(24 more\)$/)
    expect(nodesOf(r, 'value')[0]!.length).toBe(80)
  })
})

describe('broken input never throws', () => {
  it('detects loops', async () => {
    const t = new TiffBuilder()
    const a = t.ifd().entry(1, 'SHORT', [1])
    const b = t.ifd().entry(2, 'SHORT', [2])
    a.nextIfd(b)
    b.nextIfd(a)
    const built = t.build()
    const r = await parse(built.bytes)
    const ifds = nodesOf(r, 'ifd')
    expect(ifds).toHaveLength(3)
    expect(ifds[2]).toMatchObject({
      status: 'broken',
      offset: built.layout.ifds[1]!.nextPointerOffset,
    })
    expect(ifds[2]!.messages[0]).toMatch(/loop/i)
    expect(r.warnings.length).toBeGreaterThan(0)
  })

  it('detects self loop', async () => {
    const t = new TiffBuilder()
    const a = t.ifd()
    a.nextIfd(a)
    const ifds = nodesOf(await parse(t.build().bytes), 'ifd')
    expect(ifds.map((i) => i.status)).toEqual(['ok', 'broken'])
  })

  it('marks out-of-range value offsets as broken and continues', async () => {
    const t = new TiffBuilder()
    t.ifd()
      .entry(1, 'LONG', [1, 2, 3], { rawValueField: 0x7fffff00 })
      .entry(2, 'SHORT', [9])
    const r = await parse(t.build().bytes)
    const [bad, good] = nodesOf(r, 'entry')
    expect(bad!.status).toBe('broken')
    expect(good).toMatchObject({ status: 'ok' })
    expect(good!.details!.value).toBe('9')
    expect(nodesOf(r, 'value')).toHaveLength(0)
  })

  it('marks absurd counts as broken', async () => {
    const t = new TiffBuilder()
    t.ifd()
      .entry(1, 'LONG', [1, 2, 3], { count: 0xffffffff })
      .entry(2, 'SHORT', [9])
    const [bad, good] = nodesOf(await parse(t.build().bytes), 'entry')
    expect(bad!.status).toBe('broken')
    expect(good!.status).toBe('ok')
  })

  it('warns on unknown types and keeps raw bytes', async () => {
    const t = new TiffBuilder()
    t.ifd().entry(1, 'BYTE', [1, 2, 3, 4])
    const built = t.build()
    // Patch the type id to 99.
    new DataView(built.bytes.buffer).setUint16(
      built.layout.ifds[0]!.entries[0]!.entryOffset + 2,
      99,
      true,
    )
    const r = await parse(built.bytes)
    const [e] = nodesOf(r, 'entry')
    expect(e).toMatchObject({ status: 'warning' })
    expect(e!.details!.rawValue).toBe('0x01 0x02 0x03 0x04')
  })

  it('rejects IFDs with too many entries', async () => {
    const t = new TiffBuilder()
    const ifd = t.ifd()
    for (let i = 0; i < 1001; i++) ifd.entry(i, 'SHORT', [1])
    const r = await parse(t.build().bytes)
    expect(nodesOf(r, 'ifd')[0]).toMatchObject({ status: 'broken' })
    expect(nodesOf(r, 'entry')).toHaveLength(0)
  })

  it('handles first/next IFD offsets outside the file', async () => {
    const first = new TiffBuilder().rawFirstIfdOffsetValue(0x10000)
    first.ifd()
    expect(nodesOf(await parse(first.build().bytes), 'ifd')[0]!.status).toBe(
      'broken',
    )
    const next = new TiffBuilder()
    next.ifd().rawNext(0x10000)
    expect(
      nodesOf(await parse(next.build().bytes), 'ifd').map((i) => i.status),
    ).toEqual(['ok', 'broken'])
  })

  it('handles header with no IFD', async () => {
    const t = new TiffBuilder().rawFirstIfdOffsetValue(0)
    t.ifd()
    const r = await parse(t.build().bytes)
    expect(nodesOf(r, 'ifd')).toHaveLength(0)
    expect(nodesOf(r, 'header')[0]!.status).toBe('warning')
  })

  it('survives truncation at every length', async () => {
    const t = new TiffBuilder()
    const a = t.ifd().entry(1, 'ASCII', 'hello world').entry(2, 'SHORT', [1])
    a.nextIfd(t.ifd().entry(3, 'LONG', [1, 2, 3]))
    const full = t.build()
    for (let n = 0; n <= full.layout.totalLength; n++) {
      const r = await parse(full.bytes.slice(0, n))
      expect(r.fileSize).toBe(n)
    }
    const il0 = full.layout.ifds[0]!
    const r = await parse(full.bytes.slice(0, il0.offset + 20))
    expect(nodesOf(r, 'ifd')[0]!.status).toBe('broken')
  })

  it('marks values cut by truncation as broken', async () => {
    const t = new TiffBuilder()
    t.ifd().entry(1, 'ASCII', 'hello world')
    const built = t.build()
    const il = built.layout.ifds[0]!
    const cut = il.entries[0]!.valueOffset + 4
    const r = await parse(built.bytes.slice(0, cut))
    expect(nodesOf(r, 'entry')[0]!.status).toBe('broken')
  })
})

describe('sub-directories', () => {
  const byLabel = (r: ParseResult, label: string) =>
    nodesOf(r, 'ifd').find((n) => n.label === label)!

  it('descends SubIFDs, EXIF, Interop, GPS, type-13 and MakerNote', async () => {
    const t = new TiffBuilder()
    const ifd0 = t.ifd()
    const sub0 = t.ifd().entry(1, 'SHORT', [1])
    const sub1 = t.ifd().entry(2, 'SHORT', [2])
    const exif = t.ifd()
    const interop = t.ifd().entry(1, 'ASCII', 'R98')
    const gps = t.ifd().entry(1, 'ASCII', 'N')
    const typed = t.ifd().entry(5, 'SHORT', [5])
    const mn = [...Buffer.from('Nikon\0'), ...Array(20).fill(1)]
    exif.subIfd(40965, interop).entry(37500, 'UNDEFINED', mn)
    ifd0
      .entry(330, 'LONG', [ifdOffset(sub0), ifdOffset(sub1)])
      .subIfd(34665, exif)
      .subIfd(34853, gps)
      .subIfd(0xc000, typed, 'IFD')
    const built = t.build()
    const r = await parse(built.bytes)

    const parentLabel = (label: string) =>
      r.nodes[r.nodes[byLabel(r, label).parentId!]!.parentId!]!.label
    expect(
      nodesOf(r, 'ifd')
        .map((n) => n.label)
        .sort(),
    ).toEqual(
      [
        'IFD0',
        'SubIFD0',
        'SubIFD1',
        'ExifIFD',
        'InteropIFD',
        'GPSIFD',
        'IFD 0xC000',
      ].sort(),
    )
    expect(r.nodes[byLabel(r, 'SubIFD1').parentId!]).toMatchObject({
      kind: 'entry',
      details: { tagId: 330 },
    })
    expect(parentLabel('SubIFD0')).toBe('IFD0')
    expect(parentLabel('ExifIFD')).toBe('IFD0')
    expect(parentLabel('InteropIFD')).toBe('ExifIFD')
    expect(parentLabel('GPSIFD')).toBe('IFD0')
    expect(parentLabel('IFD 0xC000')).toBe('IFD0')
    expect(nodesOf(r, 'ifd').every((n) => n.status === 'ok')).toBe(true)

    const [note] = nodesOf(r, 'makernote')
    const ml = built.layout.ifds[3]!.entries[1]!
    expect(note).toMatchObject({ offset: ml.valueOffset, length: mn.length })
    expect(note!.details).toMatchObject({
      vendor: 'Nikon',
      firstBytes: '4E 69 6B 6F 6E 00 01 01 01 01 01 01 01 01 01 01',
    })
    expect(r.regions.filter((x) => x.kind === 'makernote')).toEqual([
      {
        nodeId: note!.id,
        kind: 'makernote',
        offset: ml.valueOffset,
        length: mn.length,
      },
    ])
    // MakerNote bytes are claimed once, by the makernote region only.
    expect(nodesOf(r, 'value').some((v) => v.offset === ml.valueOffset)).toBe(
      false,
    )
  })

  it('detects a sub-IFD pointing back at IFD0', async () => {
    const t = new TiffBuilder()
    const ifd0 = t.ifd()
    const exif = t.ifd().subIfd(330, ifd0)
    ifd0.subIfd(34665, exif)
    const built = t.build()
    const r = await parse(built.bytes)
    const broken = nodesOf(r, 'ifd').filter((n) => n.status === 'broken')
    expect(broken).toHaveLength(1)
    expect(broken[0]!.messages[0]).toMatch(/loop/i)
    expect(r.nodes[broken[0]!.parentId!]!.details).toMatchObject({ tagId: 330 })
    expect(broken[0]!.offset).toBe(
      built.layout.ifds[1]!.entries[0]!.valueOffset,
    )
  })

  it('limits nesting depth', async () => {
    const t = new TiffBuilder()
    const chain = Array.from({ length: 20 }, () => t.ifd())
    chain.forEach((c, i) => {
      if (i + 1 < chain.length) c.subIfd(34665, chain[i + 1]!)
    })
    const r = await parse(t.build().bytes)
    const broken = nodesOf(r, 'ifd').filter((n) => n.status === 'broken')
    expect(broken).toHaveLength(1)
    expect(broken[0]!.messages[0]).toMatch(/nesting/i)
    expect(nodesOf(r, 'ifd')).toHaveLength(18)
  })

  it('guesses no vendor for unknown MakerNotes', async () => {
    const t = new TiffBuilder()
    t.ifd().entry(37500, 'UNDEFINED', [1, 2, 3, 4, 5, 6])
    const [note] = nodesOf(await parse(t.build().bytes), 'makernote')
    expect(note!.details!.vendor).toBeUndefined()
    expect(note!.details!.firstBytes).toBe('01 02 03 04 05 06')
  })
})

describe('fixtures', () => {
  const dir = new URL('../../fixtures/', import.meta.url)
  const files = existsSync(dir)
    ? readdirSync(dir).filter((f) =>
        /\.(dng|arw|nef|cr2|pef|orf|rw2)$/i.test(f),
      )
    : []
  it.skipIf(files.length === 0)('every sample has an IFD', async () => {
    for (const file of files) {
      const bytes = readFileSync(new URL(file, dir))
      const r = await parse(new Uint8Array(bytes))
      expect(nodesOf(r, 'ifd').length, file).toBeGreaterThanOrEqual(1)
    }
  })
  it.skipIf(files.length === 0)('every sample has an EXIF IFD', async () => {
    for (const file of files) {
      const bytes = readFileSync(new URL(file, dir))
      const r = await parse(new Uint8Array(bytes))
      expect(
        nodesOf(r, 'ifd').some((n) => n.label === 'ExifIFD'),
        file,
      ).toBe(true)
    }
  })
  it.skipIf(files.length === 0)('DNG/NEF/ARW have a sub-IFD', async () => {
    for (const file of files.filter((f) => /\.(dng|nef|arw)$/i.test(f))) {
      const bytes = readFileSync(new URL(file, dir))
      const r = await parse(new Uint8Array(bytes))
      expect(
        nodesOf(r, 'ifd').some((n) => n.label.startsWith('SubIFD')),
        file,
      ).toBe(true)
    }
  })
})

describe('image data regions', () => {
  // SOI, SOF0 (8-bit, 24x32 -> height 24? see below), EOI
  const jpeg = (w: number, h: number) => [
    0xff,
    0xd8,
    0xff,
    0xc0,
    0,
    11,
    8,
    h >> 8,
    h & 255,
    w >> 8,
    w & 255,
    1,
    1,
    0x11,
    0,
    0xff,
    0xd9,
  ]
  const regionsOf = (r: ParseResult, kind: string) =>
    r.regions.filter((x) => x.kind === kind)

  it('merges contiguous strips into one region', async () => {
    const t = new TiffBuilder()
    const a = t.blob([1, 2, 3, 4])
    const b = t.blob([5, 6, 7, 8])
    t.ifd()
      .entry(0x103, 'SHORT', [1])
      .entry(0x106, 'SHORT', [32803])
      .entry(273, 'LONG', [blobOffset(a), blobOffset(b)])
      .entry(279, 'LONG', [blobLength(a), blobLength(b)])
    const r = await parse(t.build().bytes)
    const [node] = nodesOf(r, 'image-data').filter((n) => n.childIds.length)
    expect(node!.childIds).toHaveLength(2)
    const regs = regionsOf(r, 'raw-data')
    expect(regs).toHaveLength(1)
    expect(regs[0]).toMatchObject({ length: 8, nodeId: node!.id })
  })

  it('keeps non-contiguous strips as separate regions', async () => {
    const t = new TiffBuilder()
    const a = t.blob([1, 2, 3, 4])
    t.blob([9, 9])
    const c = t.blob([5, 6, 7, 8])
    t.ifd()
      .entry(0x106, 'SHORT', [32803])
      .entry(273, 'LONG', [blobOffset(a), blobOffset(c)])
      .entry(279, 'LONG', [4, 4])
    const r = await parse(t.build().bytes)
    expect(regionsOf(r, 'raw-data')).toHaveLength(2)
  })

  it('handles tiles', async () => {
    const t = new TiffBuilder()
    const a = t.blob([1, 2, 3, 4])
    t.ifd()
      .entry(0x106, 'SHORT', [32803])
      .entry(324, 'LONG', [blobOffset(a)])
      .entry(325, 'LONG', [blobLength(a)])
    const r = await parse(t.build().bytes)
    const node = nodesOf(r, 'image-data')[0]!
    expect(node.details).toMatchObject({ pieceKind: 'Tile', pieceCount: 1 })
    expect(node.childIds.map((id) => r.nodes[id]!.label)).toEqual(['Tile 0'])
    expect(regionsOf(r, 'raw-data')).toHaveLength(1)
  })

  it('lists a JPEGInterchangeFormat thumbnail with SOF size', async () => {
    const t = new TiffBuilder()
    const j = t.blob(jpeg(160, 120))
    t.ifd()
      .entry(513, 'LONG', [blobOffset(j)])
      .entry(514, 'LONG', [blobLength(j)])
    const built = t.build()
    const r = await parse(built.bytes)
    expect(nodesOf(r, 'thumbnail')).toHaveLength(2)
    expect(regionsOf(r, 'thumbnail')).toEqual([
      expect.objectContaining({
        offset: built.layout.blobs[0]!.offset,
        length: 17,
      }),
    ])
    expect(r.previews).toEqual([
      {
        nodeId: nodesOf(r, 'thumbnail')[0]!.id,
        offset: built.layout.blobs[0]!.offset,
        length: 17,
        width: 160,
        height: 120,
        mime: 'image/jpeg',
      },
    ])
  })

  it('classifies large JPEGs as previews using IFD dimensions', async () => {
    const t = new TiffBuilder()
    const j = t.blob(jpeg(1, 1))
    t.ifd()
      .entry(254, 'LONG', [1])
      .entry(256, 'LONG', [1024])
      .entry(257, 'LONG', [768])
      .entry(259, 'SHORT', [7])
      .entry(258, 'SHORT', [8, 8, 8])
      .entry(273, 'LONG', [blobOffset(j)])
      .entry(279, 'LONG', [blobLength(j)])
    const r = await parse(t.build().bytes)
    expect(nodesOf(r, 'preview').length).toBeGreaterThan(0)
    expect(r.previews[0]).toMatchObject({ width: 1024, height: 768 })
  })

  it('warns when a JPEG does not start with FFD8', async () => {
    const t = new TiffBuilder()
    const j = t.blob([1, 2, 3, 4, 5, 6])
    t.ifd()
      .entry(513, 'LONG', [blobOffset(j)])
      .entry(514, 'LONG', [blobLength(j)])
    const r = await parse(t.build().bytes)
    const n = nodesOf(r, 'preview')[0]!
    expect(n.status).toBe('warning')
    expect(n.messages.join()).toMatch(/FFD8/)
  })

  it('flags offsets past EOF as broken', async () => {
    const t = new TiffBuilder()
    const a = t.blob([1, 2, 3, 4])
    t.ifd()
      .entry(0x106, 'SHORT', [32803])
      .entry(273, 'LONG', [blobOffset(a), 100000])
      .entry(279, 'LONG', [4, 4])
    const r = await parse(t.build().bytes)
    const node = nodesOf(r, 'image-data')[0]!
    const kids = node.childIds.map((id) => r.nodes[id]!)
    expect(kids.map((k) => k.status)).toEqual(['ok', 'broken'])
    expect(regionsOf(r, 'raw-data')).toHaveLength(1)
  })

  it('warns on mismatched array lengths', async () => {
    const t = new TiffBuilder()
    const a = t.blob([1, 2, 3, 4])
    t.ifd()
      .entry(0x106, 'SHORT', [32803])
      .entry(273, 'LONG', [blobOffset(a), blobOffset(a)])
      .entry(279, 'LONG', [4])
    const r = await parse(t.build().bytes)
    expect(r.warnings.some((w) => /differ in length/.test(w.message))).toBe(
      true,
    )
    expect(nodesOf(r, 'image-data')[0]!.details!.pieceCount).toBe(1)
  })

  const files = existsSync(new URL('../../fixtures/', import.meta.url))
    ? readdirSync(new URL('../../fixtures/', import.meta.url)).filter((f) =>
        /\.(dng|arw|nef|cr2)$/i.test(f),
      )
    : []
  it.skipIf(files.length === 0)(
    'real samples have raw data and a preview',
    async () => {
      for (const file of files) {
        const bytes = readFileSync(
          new URL(`../../fixtures/${file}`, import.meta.url),
        )
        const r = await parse(new Uint8Array(bytes))
        expect(r.previews.length, file).toBeGreaterThanOrEqual(1)
        expect(
          r.regions.filter((x) => x.kind === 'raw-data').length,
          file,
        ).toBeGreaterThanOrEqual(1)
      }
    },
  )
})
