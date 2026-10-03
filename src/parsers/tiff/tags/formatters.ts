import type { Rational, TagFormatter, TagValue } from './types'

const isRational = (x: number | Rational): x is Rational =>
  typeof x === 'object'

const unknown = (n: number) => `Unknown (${n})`

/** Formatter for a single integer looked up in a table. */
export function lookup(table: Record<number, string>): TagFormatter {
  return (v) => {
    const n = v.items[0]
    if (v.items.length !== 1 || n === undefined || isRational(n)) return
    return table[n] ?? unknown(n)
  }
}

/** Formatter for a bitmask: names of set bits, or `zero` when no bit is set. */
export function bitmask(bits: Record<number, string>, zero: string) {
  return ((v) => {
    const n = v.items[0]
    if (n === undefined || isRational(n)) return
    const names = Object.entries(bits)
      .filter(([bit]) => (n & Number(bit)) !== 0)
      .map(([, name]) => name)
    return names.length ? names.join(', ') : n === 0 ? zero : unknown(n)
  }) satisfies TagFormatter
}

const ratio = (r: Rational): number | undefined =>
  r.den === 0 ? undefined : r.num / r.den

/** Rounds to at most `digits` decimals and drops trailing zeros. */
export function trimNumber(n: number, digits = 1): string {
  return String(Number(n.toFixed(digits)))
}

function singleRational(v: TagValue): number | undefined {
  const r = v.items[0]
  return r !== undefined && isRational(r) ? ratio(r) : undefined
}

/** Exposure time as `1/250` for fast shutters, else seconds. */
export const exposureTime: TagFormatter = (v) => {
  const t = singleRational(v)
  if (t === undefined) return
  if (t <= 0) return '0'
  if (t < 0.5) return `1/${Math.round(1 / t)}`
  return `${trimNumber(t)} s`
}

export const fNumber: TagFormatter = (v) => {
  const f = singleRational(v)
  return f === undefined ? undefined : `f/${trimNumber(f)}`
}

export const millimetres: TagFormatter = (v) => {
  const n = singleRational(v)
  return n === undefined ? undefined : `${trimNumber(n)} mm`
}

export const evValue: TagFormatter = (v) => {
  const n = singleRational(v)
  if (n === undefined) return
  return `${n > 0 ? '+' : ''}${trimNumber(n, 2)} EV`
}

/** Dotted bytes, e.g. DNGVersion `1.4.0.0`. */
export const dottedBytes: TagFormatter = (v) => {
  if (v.items.length === 0 || v.items.some(isRational)) return
  return v.items.join('.')
}

const CFA_COLORS = ['R', 'G', 'B', 'C', 'M', 'Y', 'W']

const cfaLetters = (bytes: (number | Rational)[]): string | undefined => {
  if (bytes.length === 0 || bytes.some(isRational)) return
  return bytes.map((b) => CFA_COLORS[b as number] ?? '?').join('')
}

/** DNG / TIFF-EP CFAPattern: plain colour codes, e.g. `RGGB`. */
export const cfaPattern: TagFormatter = (v) => cfaLetters(v.items)

/** EXIF CFAPattern: 2x u16 repeat dimensions followed by colour codes. */
export const exifCfaPattern: TagFormatter = (v) => {
  if (v.items.length < 5 || v.items.some(isRational)) return
  const [b0, b1, b2, b3] = v.items as number[]
  const w = v.littleEndian ? b0! | (b1! << 8) : (b0! << 8) | b1!
  const h = v.littleEndian ? b2! | (b3! << 8) : (b2! << 8) | b3!
  const letters = cfaLetters(v.items.slice(4))
  if (letters === undefined || w * h !== letters.length) return
  return letters
}

export const compression = lookup({
  1: 'Uncompressed',
  2: 'CCITT 1D',
  3: 'CCITT Group 3',
  4: 'CCITT Group 4',
  5: 'LZW',
  6: 'JPEG (old-style)',
  7: 'JPEG',
  8: 'Deflate',
  9: 'JBIG B&W',
  10: 'JBIG Color',
  34712: 'JPEG 2000',
  32773: 'PackBits',
  34892: 'Lossy JPEG',
  34925: 'LZMA',
  50000: 'ZSTD',
  50001: 'WebP',
  65535: 'Nikon NEF Compressed',
  32769: 'Packed RAW',
  32770: 'Samsung SRW Compressed',
  32867: 'Kodak KDC Compressed',
  32946: 'Deflate (old)',
  32909: 'Pentax PEF Compressed',
})

export const photometric = lookup({
  0: 'WhiteIsZero',
  1: 'BlackIsZero',
  2: 'RGB',
  3: 'Palette',
  4: 'Transparency Mask',
  5: 'CMYK',
  6: 'YCbCr',
  8: 'CIELab',
  9: 'ICCLab',
  10: 'ITULab',
  32803: 'Color Filter Array',
  32844: 'Pixar LogL',
  32845: 'Pixar LogLuv',
  34892: 'Linear Raw',
})

export const orientation = lookup({
  1: 'Horizontal (normal)',
  2: 'Mirror horizontal',
  3: 'Rotate 180',
  4: 'Mirror vertical',
  5: 'Mirror horizontal and rotate 270 CW',
  6: 'Rotate 90 CW',
  7: 'Mirror horizontal and rotate 90 CW',
  8: 'Rotate 270 CW',
})

export const newSubfileType = bitmask(
  {
    1: 'Reduced-resolution image',
    2: 'Single page of multi-page image',
    4: 'Transparency mask',
  },
  'Full-resolution image',
)

export const subfileType = lookup({
  1: 'Full-resolution image',
  2: 'Reduced-resolution image',
  3: 'Single page of multi-page image',
})

export const planarConfiguration = lookup({ 1: 'Chunky', 2: 'Planar' })

export const resolutionUnit = lookup({ 1: 'None', 2: 'inches', 3: 'cm' })

export const exposureProgram = lookup({
  0: 'Not defined',
  1: 'Manual',
  2: 'Program AE',
  3: 'Aperture-priority AE',
  4: 'Shutter speed priority AE',
  5: 'Creative (slow speed)',
  6: 'Action (high speed)',
  7: 'Portrait',
  8: 'Landscape',
  9: 'Bulb',
})

export const meteringMode = lookup({
  0: 'Unknown',
  1: 'Average',
  2: 'Center-weighted average',
  3: 'Spot',
  4: 'Multi-spot',
  5: 'Multi-segment',
  6: 'Partial',
  255: 'Other',
})

export const flash = lookup({
  0x0: 'No Flash',
  0x1: 'Fired',
  0x5: 'Fired, Return not detected',
  0x7: 'Fired, Return detected',
  0x8: 'On, Did not fire',
  0x9: 'On, Fired',
  0xd: 'On, Return not detected',
  0xf: 'On, Return detected',
  0x10: 'Off, Did not fire',
  0x14: 'Off, Did not fire, Return not detected',
  0x18: 'Auto, Did not fire',
  0x19: 'Auto, Fired',
  0x1d: 'Auto, Fired, Return not detected',
  0x1f: 'Auto, Fired, Return detected',
  0x20: 'No flash function',
  0x30: 'Off, No flash function',
  0x41: 'Fired, Red-eye reduction',
  0x45: 'Fired, Red-eye reduction, Return not detected',
  0x47: 'Fired, Red-eye reduction, Return detected',
  0x49: 'On, Red-eye reduction',
  0x4d: 'On, Red-eye reduction, Return not detected',
  0x4f: 'On, Red-eye reduction, Return detected',
  0x50: 'Off, Red-eye reduction',
  0x58: 'Auto, Did not fire, Red-eye reduction',
  0x59: 'Auto, Fired, Red-eye reduction',
  0x5d: 'Auto, Fired, Red-eye reduction, Return not detected',
  0x5f: 'Auto, Fired, Red-eye reduction, Return detected',
})

export const colorSpace = lookup({
  1: 'sRGB',
  2: 'Adobe RGB',
  0xfffd: 'Wide Gamut RGB',
  0xfffe: 'ICC Profile',
  0xffff: 'Uncalibrated',
})
