import { TreeBuilder } from './tree-builder'
import type { ParseResult } from './types'

/** Builds a hand-made ParseResult for a fictional 4096-byte DNG. */
function build(): ParseResult {
  const b = new TreeBuilder(4096)
  b.setFormat({ id: 'dng', name: 'Adobe DNG', make: 'Examplar', model: 'X1' })

  const root = b.addNode({
    kind: 'file',
    label: 'example.dng',
    offset: 0,
    length: 0,
  })

  const header = b.addNode({
    kind: 'header',
    label: 'TIFF Header',
    offset: 0,
    length: 8,
    parentId: root,
    details: { byteOrder: 'II', magic: 42, ifd0Offset: 8 },
  })
  b.addRegion({ nodeId: header, kind: 'header', offset: 0, length: 8 })

  // IFD0: 4 entries -> 2 + 4*12 + 4 = 54 bytes at 8
  const ifd0 = b.addNode({
    kind: 'ifd',
    label: 'IFD0',
    offset: 8,
    length: 54,
    parentId: root,
    details: { entries: 4 },
  })
  b.addRegion({ nodeId: ifd0, kind: 'ifd', offset: 8, length: 54 })
  const tags: [string, number, number, number][] = [
    ['ImageWidth', 0x100, 3, 4000],
    ['ImageLength', 0x101, 3, 3000],
    ['Make', 0x10f, 2, 0],
  ]
  tags.forEach(([label, tagId, type, value], i) => {
    b.addNode({
      kind: 'entry',
      label,
      offset: 10 + i * 12,
      length: 12,
      parentId: ifd0,
      details: { tagId, type, count: 1, value },
    })
  })
  b.addNode({
    kind: 'entry',
    label: 'ExifIFDPointer',
    offset: 46,
    length: 12,
    parentId: ifd0,
    details: { tagId: 0x8769, type: 4, count: 1, value: 128 },
  })
  b.addNode({
    kind: 'entry',
    label: 'SubIFDs',
    offset: 58,
    length: 4,
    parentId: ifd0,
    status: 'warning',
    messages: ['Entry table overlaps next-IFD pointer'],
    details: { tagId: 0x14a, type: 4, count: 1, value: 160 },
  })
  const makeValue = b.addNode({
    kind: 'value',
    label: 'Make value',
    offset: 64,
    length: 8,
    parentId: ifd0,
    details: { value: 'Examplar' },
  })
  b.addRegion({ nodeId: makeValue, kind: 'value', offset: 64, length: 8 })

  // EXIF IFD at 128
  const exif = b.addNode({
    kind: 'ifd',
    label: 'EXIF IFD',
    offset: 128,
    length: 30,
    parentId: ifd0,
    details: { entries: 2 },
  })
  b.addRegion({ nodeId: exif, kind: 'ifd', offset: 128, length: 30 })
  b.addNode({
    kind: 'entry',
    label: 'ExposureTime',
    offset: 130,
    length: 12,
    parentId: exif,
    details: { tagId: 0x829a, type: 5, count: 1, value: '1/250' },
  })
  b.addNode({
    kind: 'entry',
    label: 'ISOSpeedRatings',
    offset: 142,
    length: 12,
    parentId: exif,
    details: { tagId: 0x8827, type: 3, count: 1, value: 200 },
  })

  // SubIFD at 160 with raw data
  const sub = b.addNode({
    kind: 'ifd',
    label: 'SubIFD',
    offset: 160,
    length: 30,
    parentId: ifd0,
    details: { entries: 2 },
  })
  b.addRegion({ nodeId: sub, kind: 'ifd', offset: 160, length: 30 })
  b.addNode({
    kind: 'entry',
    label: 'StripOffsets',
    offset: 162,
    length: 12,
    parentId: sub,
    details: { tagId: 0x111, type: 4, count: 1, value: 2048 },
  })
  b.addNode({
    kind: 'entry',
    label: 'StripByteCounts',
    offset: 174,
    length: 12,
    parentId: sub,
    details: { tagId: 0x117, type: 4, count: 1, value: 1024 },
  })
  const raw = b.addNode({
    kind: 'image-data',
    label: 'Raw image data',
    offset: 2048,
    length: 1024,
    parentId: sub,
  })
  b.addRegion({ nodeId: raw, kind: 'raw-data', offset: 2048, length: 1024 })

  // Thumbnail JPEG
  const thumb = b.addNode({
    kind: 'thumbnail',
    label: 'Thumbnail',
    offset: 512,
    length: 600,
    parentId: ifd0,
  })
  b.addRegion({ nodeId: thumb, kind: 'thumbnail', offset: 512, length: 600 })
  b.addPreview({
    nodeId: thumb,
    offset: 512,
    length: 600,
    width: 160,
    height: 120,
    mime: 'image/jpeg',
  })

  // Unknown region
  const unknown = b.addNode({
    kind: 'unknown',
    label: 'Unknown data',
    offset: 3072,
    length: 1024,
    parentId: root,
    status: 'warning',
    messages: ['Unreferenced bytes'],
  })
  b.addRegion({ nodeId: unknown, kind: 'unknown', offset: 3072, length: 1024 })
  b.addWarning(unknown, 'Unreferenced bytes at end of file')

  return b.build()
}

/** A realistic example ParseResult for UI work before the real parser exists. */
export const exampleResult: ParseResult = build()
