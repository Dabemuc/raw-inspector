// Bundling-only entry: `npm run build:check` verifies Vite emits a module worker + wasm asset for both candidates.
import LibRawYb from 'libraw-wasm'

const colorhythm = new Worker(new URL('./colorhythm.worker.js', import.meta.url), { type: 'module' })
colorhythm.postMessage({ url: '/sample.arw', mode: 'raw' })

const yb = new LibRawYb()
void yb.open(new Uint8Array(), {})
