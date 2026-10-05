import { describe, expect, it } from 'vitest'
import { createMemoryReader } from '../../src/core/io'
import { parseFile } from '../../src/parsers'
import { metadataFromParseResult } from '../../src/metadata/fromParseResult'
import { TiffBuilder } from '../helpers/tiffBuilder'

describe('metadataFromParseResult', () => {
  it('turns IFD entries into groups with tag ids', async () => {
    const t = new TiffBuilder()
    const i0 = t.ifd()
    const exif = t.ifd()
    exif.entry(0x829a, 'RATIONAL', [1, 250]).entry(0x8827, 'SHORT', [400])
    i0.entry(0x100, 'SHORT', [640])
      .entry(0x10f, 'ASCII', 'Acme')
      .subIfd(0x8769, exif)
    const r = metadataFromParseResult(
      await parseFile(createMemoryReader(t.build().bytes)),
    )

    expect(r.source).toBe('parser')
    expect(r.groups.map((g) => [g.id, g.family, g.name])).toEqual([
      ['EXIF:IFD0', 'EXIF', 'IFD0'],
      ['EXIF:ExifIFD', 'EXIF', 'ExifIFD'],
    ])
    const [ifd0, exifIfd] = r.groups
    expect(ifd0!.tags.slice(0, 2).map((x) => x.name)).toEqual([
      'ImageWidth',
      'Make',
    ])
    expect(ifd0!.tags[0]).toMatchObject({
      tagId: 0x100,
      value: '640',
      raw: '640',
    })
    expect(ifd0!.tags[1]).toMatchObject({ tagId: 0x10f, value: 'Acme' })
    expect(exifIfd!.tags[0]).toMatchObject({
      name: 'ExposureTime',
      tagId: 0x829a,
      value: '1/250',
    })
    expect(exifIfd!.tags[1]).toMatchObject({
      name: 'ISOSpeedRatings',
      tagId: 0x8827,
    })
  })

  it('returns no groups for non-TIFF', async () => {
    expect(
      metadataFromParseResult(
        await parseFile(createMemoryReader(new Uint8Array(32))),
      ).groups,
    ).toEqual([])
  })
})
