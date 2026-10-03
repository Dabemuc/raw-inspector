import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { createMemoryReader } from '../../src/core/io'
import type { ParseResult, StructureNode } from '../../src/core/model'
import { parseFile } from '../../src/parsers'
import { describeFixture, fixtureManifest } from '../helpers/fixtures'
import { TiffBuilder } from '../helpers/tiffBuilder'

const parse = (bytes: Uint8Array, fileName?: string) =>
  parseFile(createMemoryReader(bytes), { fileName })
const find = (r: ParseResult, pred: (n: StructureNode) => boolean) =>
  Object.values(r.nodes).filter(pred)

function simple(
  opts: ConstructorParameters<typeof TiffBuilder>[0],
  make?: string,
  model?: string,
  extra?: (t: TiffBuilder, ifd: ReturnType<TiffBuilder['ifd']>) => void,
) {
  const t = new TiffBuilder(opts)
  const ifd = t.ifd()
  if (make) ifd.entry(0x10f, 'ASCII', make)
  if (model) ifd.entry(0x110, 'ASCII', model)
  extra?.(t, ifd)
  return t.build().bytes
}

describe('format detection', () => {
  it.each([
    ['NIKON CORPORATION', 'NIKON D70', 'nef'],
    ['SONY', 'ILCE-7M3', 'arw'],
    ['PENTAX Corporation', 'PENTAX K-5', 'pef'],
  ])('detects %s by Make', async (make, model, id) => {
    const r = await parse(simple({}, make, model))
    expect(r.format).toMatchObject({ id, make, model })
  })

  it('detects DNG from DNGVersion', async () => {
    const r = await parse(
      simple({}, 'Leica', 'M8', (_, ifd) =>
        ifd.entry(50706, 'BYTE', [1, 4, 0, 0]),
      ),
    )
    expect(r.format).toMatchObject({ id: 'dng', make: 'Leica', model: 'M8' })
  })

  it('detects ORF and RW2 by magic', async () => {
    expect((await parse(simple({ magic: 0x4f52 }, 'OLYMPUS'))).format?.id).toBe(
      'orf',
    )
    expect((await parse(simple({ magic: 0x5352 }))).format?.id).toBe('orf')
    expect((await parse(simple({ magic: 0x55 }, 'Panasonic'))).format?.id).toBe(
      'rw2',
    )
  })

  it('falls back to the extension only as a hint', async () => {
    const bytes = simple({})
    expect((await parse(bytes, 'IMG_1.NEF')).format?.id).toBe('nef')
    expect((await parse(bytes)).format?.id).toBe('tiff')
    // Magic/tag evidence beats the extension.
    const sony = simple({}, 'SONY', 'A')
    expect((await parse(sony, 'x.nef')).format?.id).toBe('arw')
  })

  it('has no format for non-TIFF unknown data', async () => {
    expect((await parse(new Uint8Array(32).fill(7))).format).toBeNull()
  })
})

describe('CR3 / RAF', () => {
  it('flags CR3 as unsupported', async () => {
    const b = new Uint8Array(64)
    b.set([0, 0, 0, 24], 0)
    b.set(
      Array.from('ftypcrx ', (c) => c.charCodeAt(0)),
      4,
    )
    const r = await parse(b)
    expect(r.format).toMatchObject({ id: 'cr3', name: 'Canon CR3' })
    expect(r.warnings.map((w) => w.message).join()).toMatch(/not supported yet/)
  })

  it('flags RAF as unsupported', async () => {
    const b = new Uint8Array(64)
    b.set(
      Array.from('FUJIFILMCCD-RAW 0201', (c) => c.charCodeAt(0)),
      0,
    )
    const r = await parse(b)
    expect(r.format).toMatchObject({ id: 'raf', name: 'Fujifilm RAF' })
    expect(r.warnings.map((w) => w.message).join()).toMatch(/not supported yet/)
  })
})

describe('CR2', () => {
  function cr2() {
    const t = new TiffBuilder({
      headerExtra: [0x43, 0x52, 2, 1, 0, 0, 0, 0],
    })
    const mk = (n: number) => {
      const ifd = t.ifd()
      if (n === 0)
        ifd.entry(0x10f, 'ASCII', 'Canon').entry(0x110, 'ASCII', 'EOS')
      if (n === 3) ifd.entry(0xc640, 'SHORT', [1, 2000, 1000])
      return ifd
    }
    const ifds = [0, 1, 2, 3].map(mk)
    ifds.forEach((f, i) => i < 3 && f.nextIfd(ifds[i + 1]!))
    return t.build().bytes
  }

  it('emits the CR2 header, labels the raw IFD, reads CR2Slice', async () => {
    const r = await parse(cr2())
    expect(r.format).toMatchObject({ id: 'cr2', make: 'Canon', model: 'EOS' })
    const [ext] = find(r, (n) => n.label === 'CR2 Header')
    expect(ext).toMatchObject({ kind: 'header', offset: 8, length: 8 })
    expect(ext!.details).toMatchObject({ version: '2.1' })
    const [raw] = find(r, (n) => n.label === 'IFD3 (Raw IFD)')
    expect(raw!.details).toMatchObject({
      cr2Slice: '1,2000,1000',
      cr2SliceCount: 1,
      cr2SliceWidth: 2000,
      cr2SliceLastWidth: 1000,
    })
  })
})

describe('raw IFD labels', () => {
  const rawIfd = (t: TiffBuilder, ifd: ReturnType<TiffBuilder['ifd']>) => {
    const blob = t.blob(new Array(16).fill(1))
    ifd
      .entry(0x100, 'LONG', [4000])
      .entry(0x101, 'LONG', [3000])
      .entry(0x106, 'SHORT', [32803])
      .entry(0x111, 'LONG', [{ kind: 'blobOffset', blob }])
      .entry(0x117, 'LONG', [16])
  }

  it.each([
    ['NIKON', 'nef'],
    ['SONY', 'arw'],
  ])('labels the CFA IFD of %s as Raw image', async (make) => {
    const r = await parse(simple({}, make, 'X', rawIfd))
    expect(find(r, (n) => n.label === 'IFD0 (Raw image)')).toHaveLength(1)
  })

  it('labels DNG IFDs by role', async () => {
    const t = new TiffBuilder()
    const thumb = t.ifd()
    const raw = t.ifd()
    const bl = t.blob(new Array(16).fill(1))
    thumb
      .entry(50706, 'BYTE', [1, 4, 0, 0])
      .entry(254, 'LONG', [1])
      .entry(0x100, 'LONG', [128])
      .entry(0x101, 'LONG', [96])
      .entry(0x106, 'SHORT', [2])
      .entry(0x111, 'LONG', [{ kind: 'blobOffset', blob: bl }])
      .entry(0x117, 'LONG', [16])
      .entry(330, 'LONG', [{ kind: 'ifdOffset', ifd: raw }])
    rawIfd(t, raw.entry(254, 'LONG', [0]))
    const r = await parse(t.build().bytes)
    expect(r.format?.id).toBe('dng')
    const labels = find(r, (n) => n.kind === 'ifd').map((n) => n.label)
    expect(labels).toContain('IFD0 (Thumbnail)')
    expect(labels).toContain('SubIFD0 (Raw image)')
  })
})

describe('fixtures', () => {
  for (const sample of fixtureManifest.samples) {
    describeFixture(sample.name, (path) => {
      it(`is detected as ${sample.format} (${sample.camera})`, async () => {
        const r = await parse(new Uint8Array(readFileSync(path)), sample.name)
        expect(r.format?.id).toBe(sample.format.toLowerCase())
        expect(r.format?.make).toBeTruthy()
        expect(r.format?.model).toBeTruthy()
      })
    })
  }
})
