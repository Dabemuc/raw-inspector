// One decode in a fresh process. Usage: node child.mjs <colorhythm|yb> <file> <raw|full|half>
// Prints a JSON line including process peak RSS (includes the worker thread's WASM heap).
import { Worker } from 'node:worker_threads'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const [lib, file, mode] = process.argv.slice(2)
const require = createRequire(import.meta.url)
const ms = () => performance.now()
const script =
  lib === 'yb'
    ? require.resolve('libraw-wasm').replace(/index\.js$/, 'worker.js')
    : fileURLToPath(new URL('./src/colorhythm.worker.js', import.meta.url))
const worker = new Worker(fileURLToPath(new URL('./node-worker-shim.mjs', import.meta.url)), { workerData: { script } })

function once() {
  return new Promise((resolve, reject) => {
    worker.once('message', resolve)
    worker.once('error', reject)
  })
}
let nextId = 0
const call = (fn, ...args) =>
  new Promise((resolve, reject) => {
    const id = nextId++
    const h = ({ id: rid, out, error }) => {
      if (rid !== id) return
      worker.off('message', h)
      error ? reject(new Error(error)) : resolve(out)
    }
    worker.on('message', h)
    worker.postMessage({ id, fn, args })
  })

async function runYb() {
  const t = {}
  let t0 = ms()
  const bytes = new Uint8Array(await readFile(new URL(`./samples/${file}`, import.meta.url)))
  t.fetch = ms() - t0
  const settings = mode === 'raw' ? {} : { useCameraWb: true, outputBps: 8, outputColor: 1, halfSize: mode === 'half', userQual: 3 }
  t0 = ms()
  await call('open', bytes, settings) // includes wasm init wait
  t.open = ms() - t0
  t0 = ms()
  const meta = await call('metadata', true)
  t.metadata = ms() - t0
  const cd = meta?.color_data
  const info = {
    make: meta?.camera_make, model: meta?.camera_model, width: meta?.width, height: meta?.height,
    colors: meta?.colors, filters: meta?.filters, cdesc: meta?.cdesc, black: cd?.black, maximum: cd?.maximum,
    cam_mul: cd?.cam_mul, hasCmatrix: !!cd?.cmatrix, hasCamXyz: !!cd?.cam_xyz, thumb: [meta?.thumb_width, meta?.thumb_height, meta?.thumb_format],
  }
  t0 = ms()
  if (mode === 'raw') {
    const r = await call('rawImageData')
    info.rawLen = r?.data.length
  } else {
    const r = await call('imageData')
    info.out = r && [r.width, r.height, r.colors, r.bits, r.data.length]
  }
  t.decode = ms() - t0
  t0 = ms()
  try {
    const th = await call('thumbnailData')
    info.thumbData = th && [th.format, th.width, th.height, th.data.length]
  } catch (e) {
    info.thumbErr = String(e.message)
  }
  t.thumb = ms() - t0
  return { t, info }
}

async function runColor() {
  const p = once()
  worker.postMessage({ url: '/' + file, mode })
  const r = await p
  if (r.error) throw new Error(r.error)
  return r
}

try {
  const out = lib === 'yb' ? await runYb() : await runColor()
  console.log(JSON.stringify({ lib, file, mode, ok: true, maxRssMb: Math.round(process.resourceUsage().maxRSS / 1024), ...out }))
} catch (e) {
  console.log(JSON.stringify({ lib, file, mode, ok: false, error: String(e.message), maxRssMb: Math.round(process.resourceUsage().maxRSS / 1024) }))
}
await worker.terminate()
process.exit(0)
