// zeroperl-ts picks its WASM loader with `typeof window/document`, which are undefined in a Web
// Worker, so it falls into the Node branch (node:fs). Shim them, and hand it a fetch that resolves
// the Vite-emitted asset (its own fetch('./zeroperl.wasm') is relative to the page and not emitted).
import wasmUrl from '../node_modules/@6over3/zeroperl-ts/dist/esm/zeroperl.wasm?url' // not in package exports: deep relative path
import { parseMetadata } from '@uswriting/exiftool'
globalThis.window ??= self
globalThis.document ??= {}
const fetchWasm = () => fetch(wasmUrl)
const opts = { args: ['-json', '-G1', '-a', '-s'], fetch: fetchWasm, transform: (d) => JSON.parse(d) }
self.onmessage = async (e) => {
  const blob = await (await fetch('/' + e.data)).blob()
  const file = new File([blob], e.data)
  const t = performance.now()
  const r = await parseMetadata(file, opts)
  const t2 = performance.now()
  await parseMetadata(file, opts)
  self.postMessage({ ok: r.success, error: r.error, tags: r.success ? Object.keys(r.data[0]).length : 0, coldMs: Math.round(t2 - t), warmMs: Math.round(performance.now() - t2) })
}
