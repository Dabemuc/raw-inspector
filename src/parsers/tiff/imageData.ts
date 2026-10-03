/** Pure helpers for classifying TIFF image data and reading JPEG sizes. */

export type ImageClass = 'raw' | 'preview' | 'thumbnail'

export const THUMBNAIL_MAX_SIDE = 320
const PHOTOMETRIC_CFA = 32803
const PHOTOMETRIC_LINEAR_RAW = 34892
const COMPRESSION_JPEG_OLD = 6
const COMPRESSION_JPEG = 7
const COMPRESSION_LOSSY_JPEG = 34892

export interface ImageProps {
  newSubfileType?: number
  compression?: number
  photometric?: number
  bitsPerSample?: number[]
  width?: number
  height?: number
  /** True when the data comes from JPEGInterchangeFormat. */
  interchangeJpeg?: boolean
}

export function isJpegCompression(p: ImageProps): boolean {
  if (p.interchangeJpeg) return true
  const c = p.compression
  if (c === COMPRESSION_JPEG_OLD || c === COMPRESSION_LOSSY_JPEG) return true
  return c === COMPRESSION_JPEG
}

const isEightBit = (p: ImageProps): boolean =>
  p.bitsPerSample === undefined || p.bitsPerSample.every((b) => b <= 8)

/** Decides whether an image is sensor data, a preview or a thumbnail. */
export function classifyImage(p: ImageProps): ImageClass {
  const reduced = ((p.newSubfileType ?? 0) & 1) !== 0
  const jpeg = isJpegCompression(p)
  let kind: 'raw' | 'reduced'
  if (p.photometric === PHOTOMETRIC_CFA) kind = 'raw'
  else if (p.interchangeJpeg) kind = 'reduced'
  else if (p.photometric === PHOTOMETRIC_LINEAR_RAW)
    kind = jpeg && reduced ? 'reduced' : 'raw'
  else if (jpeg) kind = isEightBit(p) ? 'reduced' : 'raw'
  else kind = reduced ? 'reduced' : 'raw'
  if (kind === 'raw') return 'raw'
  const side = Math.max(p.width ?? Infinity, p.height ?? Infinity)
  return side <= THUMBNAIL_MAX_SIDE ? 'thumbnail' : 'preview'
}

/** Finds the frame size from the first SOFn marker in JPEG bytes. */
export function findJpegSize(
  data: Uint8Array,
): { width: number; height: number } | undefined {
  if (data.length < 4 || data[0] !== 0xff || data[1] !== 0xd8) return undefined
  let i = 2
  while (i + 4 <= data.length) {
    if (data[i] !== 0xff) {
      i++
      continue
    }
    const marker = data[i + 1]!
    if (marker === 0xff) {
      i++
      continue
    }
    // Standalone markers carry no length.
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd9) || marker === 0) {
      i += 2
      continue
    }
    const len = (data[i + 2]! << 8) | data[i + 3]!
    const isSof =
      marker >= 0xc0 &&
      marker <= 0xcf &&
      marker !== 0xc4 &&
      marker !== 0xc8 &&
      marker !== 0xcc
    if (isSof) {
      if (i + 9 > data.length) return undefined
      return {
        height: (data[i + 5]! << 8) | data[i + 6]!,
        width: (data[i + 7]! << 8) | data[i + 8]!,
      }
    }
    if (marker === 0xda) return undefined
    i += 2 + len
  }
  return undefined
}

export interface Piece {
  offset: number
  length: number
}

/** Merges touching/overlapping byte ranges into sorted contiguous runs. */
export function mergePieces(pieces: Piece[]): Piece[] {
  const sorted = [...pieces].sort((a, b) => a.offset - b.offset)
  const out: Piece[] = []
  for (const p of sorted) {
    const last = out[out.length - 1]
    if (last && p.offset <= last.offset + last.length) {
      last.length = Math.max(last.length, p.offset + p.length - last.offset)
    } else out.push({ ...p })
  }
  return out
}
