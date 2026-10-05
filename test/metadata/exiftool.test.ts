import { describe, expect, it } from 'vitest'
import { familyOf, metadataFromExifTool } from '../../src/metadata/exiftool'
import formatted from '../fixtures/exiftool-synthetic.json'
import numeric from '../fixtures/exiftool-synthetic-n.json'

// Recorded from @uswriting/exiftool 1.0.9 (ExifTool 13.42) on a synthetic TIFF:
// `-json -G1 -a -s` with and without `-n`.
describe('metadataFromExifTool', () => {
  const result = metadataFromExifTool(formatted, numeric)
  const group = (name: string) => result.groups.find((g) => g.name === name)!

  it('marks the result as engine output', () => {
    expect(result.source).toBe('engine')
    expect(result.engine).toBe('ExifTool')
  })

  it('groups by family-1 name in engine order and hides bookkeeping groups', () => {
    expect(result.groups.map((g) => g.name)).toEqual([
      'File',
      'IFD0',
      'ExifIFD',
      'Composite',
    ])
    expect(result.groups.map((g) => g.family)).toEqual([
      'File',
      'EXIF',
      'EXIF',
      'Composite',
    ])
  })

  it('keeps formatted values and adds raw values from the -n run', () => {
    const t = group('ExifIFD').tags.find((x) => x.name === 'ExposureTime')!
    expect(t.value).toBe('1/250')
    expect(t.raw).toBe(0.004)
    expect(group('IFD0').tags.find((x) => x.name === 'Make')).toMatchObject({
      value: 'Acme',
      raw: 'Acme',
    })
  })

  it('stringifies numbers and leaves raw out without a numeric run', () => {
    const r = metadataFromExifTool(formatted)
    const f = r.groups
      .find((g) => g.name === 'ExifIFD')!
      .tags.find((x) => x.name === 'FNumber')!
    expect(f).toEqual({ name: 'FNumber', value: '2.8' })
  })

  it('joins arrays and serialises objects', () => {
    const r = metadataFromExifTool(
      { 'Canon:Foo': [1, 2, 3], 'XMP-dc:Bar': { a: 1 } },
      { 'Canon:Foo': [1, 2, 3], 'XMP-dc:Bar': { a: 1 } },
    )
    expect(r.groups[0]!.tags[0]).toEqual({
      name: 'Foo',
      value: '1, 2, 3',
      raw: [1, 2, 3],
    })
    expect(r.groups[1]!.tags[0]).toMatchObject({
      value: '{"a":1}',
      raw: '{"a":1}',
    })
  })

  it('classifies families', () => {
    expect(familyOf('Canon')).toBe('MakerNotes')
    expect(familyOf('XMP-dc')).toBe('XMP')
    expect(familyOf('IPTC')).toBe('IPTC')
    expect(familyOf('ICC_Profile')).toBe('ICC')
    expect(familyOf('GPS')).toBe('EXIF')
    expect(familyOf('Track1')).toBe('Other')
  })
})
