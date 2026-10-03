/** Messages between the main thread and the lazy-loaded LibRaw worker. */

export interface DecodeOptions {
  /** Half-size decode: ~3-5x faster and uses about half the memory. */
  halfSize: boolean
}

export interface CameraMetadata {
  make: string
  model: string
  libraw: string
  /** Full sensor frame including masked margins. */
  rawWidth: number
  rawHeight: number
  /** Visible area of the sensor. */
  activeWidth: number
  activeHeight: number
  /** Size of the decoded image (smaller than active when half-size). */
  outputWidth: number
  outputHeight: number
  blackLevel: number
  blackLevels: number[]
  whiteLevel: number
  dataMaximum: number
  /** CFA colour descriptor, e.g. 'RGBG'. */
  cfaPattern: string
  /** Pattern of the top-left 2x2 (or 6x6 for X-Trans) block, row-major. */
  cfaLayout: string
  /** As-shot white balance multipliers, in cdesc order. */
  camMul: number[]
  /** Camera RGB to XYZ matrix, row-major 3x4 (rows = XYZ). */
  camXyz: number[][]
  flip: number
}

export type LibRawRequest = {
  type: 'decode'
  id: number
  file: File
  options: DecodeOptions
}

export type DecodeStage = 'loading' | 'opening' | 'unpacking' | 'processing'

export type LibRawResponse =
  | { type: 'progress'; id: number; stage: DecodeStage }
  | {
      type: 'result'
      id: number
      width: number
      height: number
      /** RGBA, 8 bit; transferred, not copied. */
      rgba: ArrayBuffer
      metadata: CameraMetadata
    }
  | { type: 'error'; id: number; message: string; outOfMemory: boolean }
