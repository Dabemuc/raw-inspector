// Module worker driving @colorhythm/libraw-wasm directly (sync API on the worker thread).
import { LibRaw } from '@colorhythm/libraw-wasm'

const ms = () => performance.now()

self.onmessage = async ({ data: { url, mode } }) => {
  try {
    const t = {}
    let t0 = ms()
    const buf = await (await fetch(url)).arrayBuffer()
    t.fetch = ms() - t0
    t0 = ms()
    await LibRaw.initialize()
    const d = new LibRaw()
    await d.waitUntilReady()
    t.init = ms() - t0
    const info = { libraw: LibRaw.version(), cameras: LibRaw.cameraCount() }
    try {
      t0 = ms()
      d.open(buf)
      t.open = ms() - t0
      const ip = d.getIParams()
      info.make = ip.make
      info.model = ip.model
      info.colors = d.getColors()
      info.filters = d.getFilters()
      info.cdesc = String.fromCharCode(...[0, 1, 2, 3].map((i) => d.getCdesc(i)))
      info.active = [d.getActiveWidth(), d.getActiveHeight()]
      info.rawDims = [d.getRawWidth(), d.getRawHeight()]
      info.black = d.getBlack()
      info.blackCh = [0, 1, 2, 3].map((i) => d.getBlackLevel(i))
      info.maximum = d.getColorMaximum()
      info.dataMaximum = d.getDataMaximum()
      info.cam_mul = [0, 1, 2, 3].map((i) => d.getCamMul(i))
      info.cam_xyz0 = [0, 1, 2].map((j) => d.getCamXyz(0, j))
      info.cmatrix0 = [0, 1, 2].map((j) => d.getCmatrix(0, j))
      info.flip = d.getFlip()
      if (mode === 'raw') {
        t0 = ms()
        d.unpack()
        t.unpack = ms() - t0
        t0 = ms()
        const raw = d.getRawImage() ?? d.getColor3Image() ?? d.getColor4Image()
        t.copyOut = ms() - t0
        info.rawLen = raw?.length
      } else {
        d.setOutputColor(1)
        d.setOutputBps(8)
        d.setUseCameraWb(1)
        d.setHalfSize(mode === 'half' ? 1 : 0)
        t0 = ms()
        d.unpack()
        t.unpack = ms() - t0
        t0 = ms()
        d.dcrawProcess()
        t.process = ms() - t0
        t0 = ms()
        const img = d.dcrawMakeMemImage()
        t.makeImage = ms() - t0
        info.out = [img.width, img.height, img.colors, img.bits, img.data_size]
      }
      t0 = ms()
      try {
        d.unpackThumb()
        const th = d.dcrawMakeMemThumb()
        info.thumbData = [th.type, th.width, th.height, th.data_size]
      } catch (e) {
        info.thumbErr = String(e.message ?? e)
      }
      t.thumb = ms() - t0
    } finally {
      d.dispose()
    }
    self.postMessage({ t, info })
  } catch (e) {
    self.postMessage({ error: String(e?.message ?? e) })
  }
}
