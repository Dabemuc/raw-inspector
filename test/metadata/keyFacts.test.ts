import { describe, expect, it } from 'vitest'
import { createMemoryReader } from '../../src/core/io'
import { parseFile } from '../../src/parsers'
import { metadataFromExifTool } from '../../src/metadata/exiftool'
import { metadataFromParseResult } from '../../src/metadata/fromParseResult'
import { buildKeyFacts } from '../../src/metadata/keyFacts'
import { TiffBuilder } from '../helpers/tiffBuilder'

const byId = (f: ReturnType<typeof buildKeyFacts>) =>
  Object.fromEntries(f.map((x) => [x.id, x]))

describe('buildKeyFacts', () => {
  it('maps engine-style results', () => {
    const r = metadataFromExifTool(
      {
        'IFD0:Make': 'SONY',
        'IFD0:Model': 'ILCE-7M3',
        'ExifIFD:LensModel': 'FE 50mm F1.8',
        'ExifIFD:DateTimeOriginal': '2026:01:02 10:20:30',
        'ExifIFD:OffsetTimeOriginal': '+01:00',
        'ExifIFD:ExposureTime': '1/250',
        'ExifIFD:FNumber': 1.8,
        'ExifIFD:ISO': 400,
        'ExifIFD:ExposureCompensation': '-0.7',
        'ExifIFD:FocalLength': '50.0 mm',
        'ExifIFD:FocalLengthIn35mmFormat': '50 mm',
        'Composite:ImageSize': '6000x4000',
        'GPS:GPSLatitude': `52 deg 30' 0.00" N`,
        'GPS:GPSLatitudeRef': 'North',
        'GPS:GPSLongitude': `13 deg 24' 0.00" W`,
        'GPS:GPSLongitudeRef': 'West',
        'GPS:GPSAltitude': '34.5 m',
        'GPS:GPSAltitudeRef': 'Above Sea Level',
      },
      undefined,
    )
    const f = byId(
      buildKeyFacts(r, { format: 'Sony ARW', fileSize: 25 * 1048576 }),
    )
    expect(f.camera!.value).toBe('SONY ILCE-7M3')
    expect(f.lens!.value).toBe('FE 50mm F1.8')
    expect(f.captured!.value).toBe('2026:01:02 10:20:30 +01:00')
    expect(f.shutter!.value).toBe('1/250 s')
    expect(f.aperture!.value).toBe('f/1.8')
    expect(f.iso!.value).toBe('400')
    expect(f.ev!.value).toBe('-0.7 EV')
    expect(f.focal!.value).toBe('50 mm (50 mm equiv.)')
    expect(f.dimensions!.value).toBe('6000 × 4000 (24 MP)')
    expect(f.format!.value).toBe('Sony ARW')
    expect(f.size!.value).toBe('25 MiB')
    expect(f.gps!.value).toBe('52.50000° N, 13.40000° W')
    expect(f.gps!.href).toContain('mlat=52.50000&mlon=-13.40000')
    expect(f.altitude!.value).toBe('34.5 m')
  })

  it('prefers composite lens and numeric GPS raw', () => {
    const r = metadataFromExifTool(
      {
        'ExifIFD:LensModel': 'Raw lens',
        'Composite:LensID': 'Nice lens',
        'Composite:GPSLatitude': `33 deg 51' 0" S`,
        'Composite:GPSLongitude': `151 deg 12' 0" E`,
      },
      { 'Composite:GPSLatitude': -33.85, 'Composite:GPSLongitude': 151.2 },
    )
    const f = byId(buildKeyFacts(r))
    expect(f.lens!.value).toBe('Nice lens')
    expect(f.gps!.value).toBe('33.85000° S, 151.20000° E')
  })

  it('maps parser-fallback results', async () => {
    const t = new TiffBuilder()
    const i0 = t.ifd()
    const exif = t.ifd()
    const gps = t.ifd()
    gps
      .entry(1, 'ASCII', 'S')
      .entry(2, 'RATIONAL', [33, 1, 51, 1, 0, 1])
      .entry(3, 'ASCII', 'E')
      .entry(4, 'RATIONAL', [151, 1, 12, 1, 0, 1])
    exif
      .entry(0x829a, 'RATIONAL', [1, 250])
      .entry(0x829d, 'RATIONAL', [28, 10])
      .entry(0x8827, 'SHORT', [400])
      .entry(0x9204, 'SRATIONAL', [-1, 3])
    i0.entry(0x10f, 'ASCII', 'Acme')
      .entry(0x110, 'ASCII', 'X1')
      .subIfd(0x8769, exif)
      .subIfd(0x8825, gps)
    const r = metadataFromParseResult(
      await parseFile(createMemoryReader(t.build().bytes)),
    )
    const f = byId(buildKeyFacts(r))
    expect(f.camera!.value).toBe('Acme X1')
    expect(f.shutter!.value).toBe('1/250 s')
    expect(f.aperture!.value).toBe('f/2.8')
    expect(f.iso!.value).toBe('400')
    expect(f.ev!.value).toBe('-0.33 EV')
    expect(f.gps!.value).toBe('33.85000° S, 151.20000° E')
  })

  it('hides missing facts', () => {
    expect(buildKeyFacts(null)).toEqual([])
    const f = byId(buildKeyFacts(metadataFromExifTool({ 'IFD0:Make': 'Acme' })))
    expect(Object.keys(f)).toEqual(['camera'])
  })
})

describe('fact sources', () => {
  it('records the group and tag a fact was read from', () => {
    const facts = buildKeyFacts({
      source: 'engine',
      groups: [
        {
          id: 'EXIF:IFD0',
          family: 'EXIF',
          name: 'IFD0',
          tags: [{ name: 'Model', value: 'X1' }],
        },
      ],
    })
    expect(facts.find((f) => f.id === 'camera')?.source).toEqual({
      group: 'IFD0',
      tag: { name: 'Model', value: 'X1' },
    })
  })
})
