import type {
  CameraMetadata,
  DecodeStage,
  LibRawRequest,
  LibRawResponse,
} from './libraw-protocol'

const scope = self as unknown as {
  onmessage: ((event: MessageEvent<LibRawRequest>) => void) | null
  postMessage(message: LibRawResponse, transfer?: Transferable[]): void
}

const range = (n: number) => Array.from({ length: n }, (_, i) => i)

function isOutOfMemory(error: unknown) {
  if (error instanceof RangeError) return true
  const text = error instanceof Error ? error.message : String(error)
  return /memory|alloc|oom|abort/i.test(text)
}

function rgbToRgba(rgb: Uint8Array, colors: number, pixels: number) {
  const out = new Uint8ClampedArray(pixels * 4)
  for (let i = 0; i < pixels; i++) {
    const s = i * colors
    const r = rgb[s]!
    out[i * 4] = r
    out[i * 4 + 1] = colors >= 3 ? rgb[s + 1]! : r
    out[i * 4 + 2] = colors >= 3 ? rgb[s + 2]! : r
    out[i * 4 + 3] = 255
  }
  return out
}

scope.onmessage = async ({ data }) => {
  if (data.type !== 'decode') return
  const { id, file, options } = data
  const progress = (stage: DecodeStage) =>
    scope.postMessage({ type: 'progress', id, stage })
  try {
    progress('loading')
    // Lazy: the WASM is only fetched once the user asks for a decode.
    const { LibRaw } = await import('@colorhythm/libraw-wasm')
    await LibRaw.initialize()
    const buffer = await file.arrayBuffer()
    const raw = new LibRaw()
    try {
      await raw.waitUntilReady()
      progress('opening')
      raw.open(buffer)
      const iparams = raw.getIParams()
      const colors = raw.getColors()
      const cdesc = range(4)
        .map((i) => String.fromCharCode(raw.getCdesc(i)))
        .join('')
        .slice(0, Math.max(colors, 1))
      const filters = raw.getFilters()
      const cfaLayout =
        filters > 1000
          ? range(4)
              .map((i) => cdesc[raw.color(i >> 1, i & 1)] ?? '?')
              .join('')
          : ''
      const metadata: CameraMetadata = {
        make: iparams.make,
        model: iparams.model,
        libraw: LibRaw.version(),
        rawWidth: raw.getRawWidth(),
        rawHeight: raw.getRawHeight(),
        activeWidth: raw.getActiveWidth(),
        activeHeight: raw.getActiveHeight(),
        outputWidth: 0,
        outputHeight: 0,
        blackLevel: raw.getBlack(),
        blackLevels: range(4).map((i) => raw.getBlackLevel(i)),
        whiteLevel: raw.getColorMaximum(),
        dataMaximum: raw.getDataMaximum(),
        cfaPattern: cdesc,
        cfaLayout,
        camMul: range(4).map((i) => raw.getCamMul(i)),
        camXyz: range(3).map((i) => range(4).map((j) => raw.getCamXyz(i, j))),
        flip: raw.getFlip(),
      }

      raw.setOutputColor(1)
      raw.setOutputBps(8)
      raw.setUseCameraWb(1)
      raw.setHalfSize(options.halfSize ? 1 : 0)
      progress('unpacking')
      raw.unpack()
      progress('processing')
      raw.dcrawProcess()
      const img = raw.dcrawMakeMemImage()
      metadata.outputWidth = img.width
      metadata.outputHeight = img.height
      const rgba = rgbToRgba(img.data, img.colors, img.width * img.height)
      scope.postMessage(
        {
          type: 'result',
          id,
          width: img.width,
          height: img.height,
          rgba: rgba.buffer,
          metadata,
        },
        [rgba.buffer],
      )
    } finally {
      raw.dispose()
    }
  } catch (error) {
    scope.postMessage({
      type: 'error',
      id,
      message: error instanceof Error ? error.message : String(error),
      outOfMemory: isOutOfMemory(error),
    })
  }
}
