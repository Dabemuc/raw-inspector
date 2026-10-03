import { describe, expect, it } from 'vitest'
import { createMemoryReader } from '../../../src/core/io'
import type { ParseResult, StructureNode } from '../../../src/core/model'
import { parseFile } from '../../../src/parsers'
import {
  formatTagValue,
  lookupTag,
  tagName,
  type TagContext,
  type TagValue,
} from '../../../src/parsers/tiff/tags'
import { TiffBuilder } from '../../helpers/tiffBuilder'

const val = (
  items: TagValue['items'],
  over: Partial<TagValue> = {},
): TagValue => ({
  type: 'SHORT',
  count: items.length,
  items,
  littleEndian: true,
  ...over,
})
const fmt = (ctx: TagContext, id: number, items: TagValue['items']) =>
  formatTagValue(ctx, id, val(items))

describe('tag lookup', () => {
  it('finds names per context', () => {
    expect(tagName('tiff', 0x100)).toBe('ImageWidth')
    expect(tagName('exif', 0x829a)).toBe('ExposureTime')
    expect(tagName('interop', 1)).toBe('InteroperabilityIndex')
    expect(tagName('tiff', 50706)).toBe('DNGVersion')
    expect(tagName('tiff', 50829)).toBe('ActiveArea')
    expect(tagName('tiff', 51008)).toBe('OpcodeList1')
    expect(lookupTag('tiff', 0x100)?.name).toBe('ImageWidth')
  })

  it('separates contexts with overlapping ids', () => {
    expect(tagName('gps', 1)).toBe('GPSLatitudeRef')
    expect(tagName('interop', 1)).toBe('InteroperabilityIndex')
    expect(tagName('tiff', 1)).toBe('Unknown (0x0001)')
    expect(tagName('gps', 0x100)).toBe('Unknown (0x0100)')
  })

  it('names unknown tags with their hex id', () => {
    expect(tagName('tiff', 0xabcd)).toBe('Unknown (0xABCD)')
    expect(lookupTag('exif', 0xabcd)).toBeUndefined()
  })
})

describe('value formatters', () => {
  it.each([
    [259, 1, 'Uncompressed'],
    [259, 7, 'JPEG'],
    [259, 9999, 'Unknown (9999)'],
    [262, 32803, 'Color Filter Array'],
    [274, 6, 'Rotate 90 CW'],
    [254, 0, 'Full-resolution image'],
    [254, 1, 'Reduced-resolution image'],
    [254, 3, 'Reduced-resolution image, Single page of multi-page image'],
    [255, 2, 'Reduced-resolution image'],
    [284, 1, 'Chunky'],
    [296, 2, 'inches'],
  ])('tiff %i = %i -> %s', (id, n, out) => {
    expect(fmt('tiff', id, [n])).toBe(out)
  })

  it.each([
    [34850, 3, 'Aperture-priority AE'],
    [37383, 5, 'Multi-segment'],
    [37385, 0x19, 'Auto, Fired'],
    [37385, 0, 'No Flash'],
    [40961, 1, 'sRGB'],
    [40961, 0xffff, 'Uncalibrated'],
  ])('exif %i = %i -> %s', (id, n, out) => {
    expect(fmt('exif', id, [n])).toBe(out)
  })

  it('formats rationals', () => {
    expect(fmt('exif', 33434, [{ num: 1, den: 250 }])).toBe('1/250')
    expect(fmt('exif', 33434, [{ num: 2, den: 1 }])).toBe('2 s')
    expect(fmt('exif', 33437, [{ num: 28, den: 10 }])).toBe('f/2.8')
    expect(fmt('exif', 37386, [{ num: 50, den: 1 }])).toBe('50 mm')
    expect(fmt('exif', 37380, [{ num: 1, den: 3 }])).toBe('+0.33 EV')
    expect(fmt('exif', 33437, [{ num: 1, den: 0 }])).toBeUndefined()
  })

  it('formats DNGVersion and CFAPattern', () => {
    expect(fmt('tiff', 50706, [1, 4, 0, 0])).toBe('1.4.0.0')
    expect(fmt('tiff', 33422, [0, 1, 1, 2])).toBe('RGGB')
    expect(fmt('exif', 41730, [3, 0, 2, 0, 1, 2, 0, 1])).toBeUndefined()
    expect(fmt('exif', 41730, [2, 0, 2, 0, 0, 1, 1, 2])).toBe('RGGB')
    expect(
      formatTagValue(
        'exif',
        41730,
        val([0, 2, 0, 2, 1, 0, 2, 1], { littleEndian: false }),
      ),
    ).toBe('GRBG')
  })

  it('falls back for tags without a formatter or odd values', () => {
    expect(fmt('tiff', 0x100, [640])).toBeUndefined()
    expect(fmt('tiff', 259, [1, 2])).toBeUndefined()
    expect(fmt('tiff', 259, [{ num: 1, den: 1 }])).toBeUndefined()
  })
})

describe('walker integration', () => {
  const parse = (bytes: Uint8Array) => parseFile(createMemoryReader(bytes))
  const entries = (r: ParseResult): StructureNode[] =>
    Object.values(r.nodes).filter((n) => n.kind === 'entry')

  it('labels entries with names and keeps raw values', async () => {
    const t = new TiffBuilder()
    t.ifd()
      .entry(0x100, 'SHORT', [6048])
      .entry(0x103, 'SHORT', [1])
      .entry(0xabcd, 'SHORT', [3])
    const r = await parse(t.build().bytes)
    const [w, c, u] = entries(r)
    expect(w).toMatchObject({ label: 'ImageWidth' })
    expect(w!.details).toMatchObject({ value: '6048', raw: '6048' })
    expect(c).toMatchObject({ label: 'Compression' })
    expect(c!.details).toMatchObject({ value: 'Uncompressed', raw: '1' })
    expect(u).toMatchObject({ label: 'Unknown (0xABCD)' })
  })

  it('uses the directory context for sub-IFD tags', async () => {
    const t = new TiffBuilder()
    const ifd0 = t.ifd().entry(0x101, 'SHORT', [1])
    const exif = t.ifd().entry(33437, 'RATIONAL', [28, 10])
    const gps = t.ifd().entry(1, 'ASCII', 'N')
    ifd0.subIfd(34665, exif).subIfd(34853, gps)
    const r = await parse(t.build().bytes)
    const byLabel = (l: string) => entries(r).find((e) => e.label === l)!
    expect(byLabel('FNumber').details!.value).toBe('f/2.8')
    expect(byLabel('FNumber').details!.raw).toBe('28/10')
    expect(byLabel('GPSLatitudeRef')).toBeDefined()
    expect(
      entries(r).filter((e) => e.label.startsWith('Unknown')),
    ).toHaveLength(0)
  })
})
