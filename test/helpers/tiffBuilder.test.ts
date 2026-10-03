import { describe, expect, it } from 'vitest'
import {
  TiffBuilder,
  blobLength,
  blobOffset,
  memoryReader,
} from './tiffBuilder'

describe('TiffBuilder', () => {
  it('is byte-identical to a hand-written simple file', () => {
    const b = new TiffBuilder()
    b.ifd().entry(256, 'SHORT', [4]).entry(271, 'ASCII', 'Canon')
    const { bytes } = b.build()
    expect(Array.from(bytes)).toEqual([
      0x49,
      0x49,
      42,
      0,
      8,
      0,
      0,
      0, // header
      2,
      0, // entry count
      0,
      1,
      3,
      0,
      1,
      0,
      0,
      0,
      4,
      0,
      0,
      0, // ImageWidth SHORT 4 inline
      15,
      1,
      2,
      0,
      6,
      0,
      0,
      0,
      38,
      0,
      0,
      0, // Make ASCII out-of-line @38
      0,
      0,
      0,
      0, // next IFD
      0x43,
      0x61,
      0x6e,
      0x6f,
      0x6e,
      0, // "Canon\0"
    ])
  })

  it('writes headers for both byte orders and custom magic', () => {
    const ii = new TiffBuilder({ byteOrder: 'II' })
    ii.ifd()
    expect(Array.from(ii.build().bytes.slice(0, 8))).toEqual([
      0x49, 0x49, 42, 0, 8, 0, 0, 0,
    ])
    const mm = new TiffBuilder({ byteOrder: 'MM', magic: 0x4f52 })
    mm.ifd()
    expect(Array.from(mm.build().bytes.slice(0, 8))).toEqual([
      0x4d, 0x4d, 0x4f, 0x52, 0, 0, 0, 8,
    ])
    const rw2 = new TiffBuilder({ magic: 0x55 })
    rw2.ifd()
    expect(Array.from(rw2.build().bytes.slice(2, 4))).toEqual([0x55, 0])
  })

  it('places values inline when ≤ 4 bytes and out-of-line otherwise', () => {
    const b = new TiffBuilder({ byteOrder: 'MM' })
    const ifd = b
      .ifd()
      .entry(1, 'SHORT', [1, 2])
      .entry(2, 'SHORT', [1, 2, 3])
      .entry(3, 'RATIONAL', [1, 2])
    const built = b.build()
    const [a, c, r] = built.ifdLayout(ifd).entries
    expect(a!.inline).toBe(true)
    expect(a!.valueOffset).toBe(a!.entryOffset + 8)
    expect(c!.inline).toBe(false)
    expect(r!.inline).toBe(false)
    const dv = new DataView(built.bytes.buffer)
    expect(dv.getUint32(c!.entryOffset + 8)).toBe(c!.valueOffset)
    expect(dv.getUint16(c!.valueOffset + 4)).toBe(3)
    expect(dv.getUint32(r!.valueOffset + 4)).toBe(2)
  })

  it('encodes numeric types', () => {
    const b = new TiffBuilder()
    const ifd = b
      .ifd()
      .entry(1, 'SSHORT', [-2])
      .entry(2, 'FLOAT', [1.5])
      .entry(3, 'DOUBLE', [2.5])
    const built = b.build()
    const [s, f, d] = built.ifdLayout(ifd).entries
    const dv = new DataView(built.bytes.buffer)
    expect(dv.getInt16(s!.valueOffset, true)).toBe(-2)
    expect(dv.getFloat32(f!.valueOffset, true)).toBe(1.5)
    expect(dv.getFloat64(d!.valueOffset, true)).toBe(2.5)
  })

  it('chains IFDs, nests sub-IFDs and references blobs', () => {
    const b = new TiffBuilder()
    const ifd0 = b.ifd()
    const ifd1 = b.ifd()
    const sub = b.ifd()
    const blob = b.blob([1, 2, 3])
    ifd0.nextIfd(ifd1).subIfd(330, sub)
    ifd0
      .entry(273, 'LONG', [blobOffset(blob)])
      .entry(279, 'LONG', [blobLength(blob)])
    const built = b.build()
    const dv = new DataView(built.bytes.buffer)
    const l0 = built.ifdLayout(ifd0)
    expect(dv.getUint32(l0.nextPointerOffset, true)).toBe(
      built.ifdLayout(ifd1).offset,
    )
    expect(dv.getUint32(l0.entries[0]!.valueOffset, true)).toBe(
      built.ifdLayout(sub).offset,
    )
    expect(dv.getUint32(l0.entries[1]!.valueOffset, true)).toBe(
      built.layout.blobs[0]!.offset,
    )
    expect(dv.getUint32(l0.entries[2]!.valueOffset, true)).toBe(3)
    expect(
      Array.from(
        built.bytes.slice(
          built.layout.blobs[0]!.offset,
          built.layout.blobs[0]!.offset + 3,
        ),
      ),
    ).toEqual([1, 2, 3])
  })

  it('supports overrides: loop, raw count/value, raw next, truncation', () => {
    const b = new TiffBuilder()
    const ifd0 = b.ifd()
    const ifd1 = b.ifd()
    ifd0
      .nextIfd(ifd1)
      .entry(1, 'LONG', [7], { count: 99, rawValueField: 0xdeadbeef })
    ifd1.nextIfd(ifd0)
    const built = b.build()
    const dv = new DataView(built.bytes.buffer)
    const l0 = built.ifdLayout(ifd0)
    expect(dv.getUint32(built.ifdLayout(ifd1).nextPointerOffset, true)).toBe(
      l0.offset,
    )
    expect(dv.getUint32(l0.entries[0]!.entryOffset + 4, true)).toBe(99)
    expect(dv.getUint32(l0.entries[0]!.entryOffset + 8, true)).toBe(0xdeadbeef)

    const c = new TiffBuilder()
    c.ifd().rawNext(1234)
    c.rawFirstIfdOffsetValue(0xffff).truncateAt(10)
    const cb = c.build()
    expect(cb.bytes.length).toBe(10)
    expect(cb.layout.totalLength).toBeGreaterThan(10)
    expect(new DataView(cb.bytes.buffer).getUint32(4, true)).toBe(0xffff)
  })
})

describe('memoryReader', () => {
  it('reads ranges and exposes size', async () => {
    const r = memoryReader(Uint8Array.from([1, 2, 3, 4]))
    expect(r.size).toBe(4)
    expect(Array.from(await r.read(1, 2))).toEqual([2, 3])
    expect((await r.read(3, 10)).length).toBe(1)
  })
})
