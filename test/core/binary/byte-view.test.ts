import { describe, expect, it } from 'vitest'
import {
  ByteView,
  OutOfBoundsError,
  hex,
  hex16,
  hex32,
  hex8,
} from '../../../src/core/binary'

const le = (...b: number[]) => new ByteView(new Uint8Array(b), true)
const be = (...b: number[]) => new ByteView(new Uint8Array(b), false)

describe('ByteView integers', () => {
  it('u8/i8', () => {
    expect(le(0xff).u8(0)).toBe(255)
    expect(be(0xff).u8(0)).toBe(255)
    expect(le(0xff).i8(0)).toBe(-1)
    expect(be(0x80).i8(0)).toBe(-128)
  })
  it('u16/i16', () => {
    expect(le(0x2a, 0x00).u16(0)).toBe(42)
    expect(be(0x00, 0x2a).u16(0)).toBe(42)
    expect(le(0xfe, 0xff).i16(0)).toBe(-2)
    expect(be(0xff, 0xfe).i16(0)).toBe(-2)
  })
  it('u32/i32', () => {
    expect(le(0x78, 0x56, 0x34, 0x12).u32(0)).toBe(0x12345678)
    expect(be(0x12, 0x34, 0x56, 0x78).u32(0)).toBe(0x12345678)
    expect(le(0xff, 0xff, 0xff, 0xff).u32(0)).toBe(4294967295)
    expect(le(0xfe, 0xff, 0xff, 0xff).i32(0)).toBe(-2)
    expect(be(0xff, 0xff, 0xff, 0xfe).i32(0)).toBe(-2)
  })
})

describe('ByteView floats', () => {
  it('f32', () => {
    expect(le(0x00, 0x00, 0xc0, 0x3f).f32(0)).toBe(1.5)
    expect(be(0x3f, 0xc0, 0x00, 0x00).f32(0)).toBe(1.5)
  })
  it('f64', () => {
    expect(le(0, 0, 0, 0, 0, 0, 0xf8, 0x3f).f64(0)).toBe(1.5)
    expect(be(0x3f, 0xf8, 0, 0, 0, 0, 0, 0).f64(0)).toBe(1.5)
  })
})

describe('ByteView rationals', () => {
  it('rational', () => {
    expect(le(1, 0, 0, 0, 3, 0, 0, 0).rational(0)).toEqual({ num: 1, den: 3 })
    expect(be(0, 0, 0, 1, 0, 0, 0, 3).rational(0)).toEqual({ num: 1, den: 3 })
    expect(le(0xff, 0xff, 0xff, 0xff, 1, 0, 0, 0).rational(0).num).toBe(
      4294967295,
    )
  })
  it('srational', () => {
    expect(le(0xff, 0xff, 0xff, 0xff, 2, 0, 0, 0).srational(0)).toEqual({
      num: -1,
      den: 2,
    })
    expect(be(0xff, 0xff, 0xff, 0xff, 0, 0, 0, 2).srational(0)).toEqual({
      num: -1,
      den: 2,
    })
  })
  it('allows zero denominator', () => {
    expect(le(5, 0, 0, 0, 0, 0, 0, 0).rational(0)).toEqual({ num: 5, den: 0 })
    expect(be(0, 0, 0, 5, 0, 0, 0, 0).srational(0)).toEqual({ num: 5, den: 0 })
  })
})

describe('ByteView ascii/bytes', () => {
  const v = le(0x41, 0x42, 0x00, 0x43, 0x00)
  it('stops at NUL and reports trailing bytes', () => {
    expect(v.ascii(0, 5)).toEqual({ text: 'AB', trailing: 2 })
  })
  it('handles no NUL', () => {
    expect(v.ascii(0, 2)).toEqual({ text: 'AB', trailing: 0 })
  })
  it('is endian independent', () => {
    expect(be(0x41, 0x42, 0x00).ascii(0, 3)).toEqual({
      text: 'AB',
      trailing: 0,
    })
  })
  it('bytes returns a slice', () => {
    expect([...v.bytes(1, 3)]).toEqual([0x42, 0x00, 0x43])
  })
})

describe('ByteView bounds', () => {
  it('throws OutOfBoundsError past the end', () => {
    const v = le(1, 2, 3)
    expect(() => v.u8(3)).toThrow(OutOfBoundsError)
    expect(() => v.u16(2)).toThrow(OutOfBoundsError)
    expect(() => v.u32(0)).toThrow(OutOfBoundsError)
    expect(() => v.f64(0)).toThrow(OutOfBoundsError)
    expect(() => v.rational(0)).toThrow(OutOfBoundsError)
    expect(() => v.ascii(1, 5)).toThrow(OutOfBoundsError)
    expect(() => v.bytes(0, 4)).toThrow(OutOfBoundsError)
    expect(() => v.u8(-1)).toThrow(OutOfBoundsError)
    expect(() => v.u8(3)).not.toThrow(RangeError)
  })
  it('respects subarray offsets', () => {
    const whole = new Uint8Array([9, 9, 0x2a, 0x00])
    const v = new ByteView(whole.subarray(2), true)
    expect(v.u16(0)).toBe(42)
    expect(() => v.u16(1)).toThrow(OutOfBoundsError)
  })
  it('withEndian switches byte order', () => {
    expect(le(0x00, 0x2a).withEndian(false).u16(0)).toBe(42)
  })
})

describe('hex formatting', () => {
  it('pads', () => {
    expect(hex(42, 4)).toBe('0x002A')
    expect(hex8(5)).toBe('0x05')
    expect(hex16(0x2a)).toBe('0x002A')
    expect(hex32(0xdeadbeef)).toBe('0xDEADBEEF')
  })
})
