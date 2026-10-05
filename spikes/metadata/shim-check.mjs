// Node stand-in for the browser worker path: forces the library's browser branch
// (window/document defined) with a custom fetch, as the Vite worker would.
import { readFile } from 'node:fs/promises'
import { parseMetadata } from '@uswriting/exiftool'
globalThis.window = globalThis
globalThis.document = {}
let wasmFetches = 0
const fetchWasm = async (u) => { wasmFetches++; return new Response(await readFile(new URL('./node_modules/@6over3/zeroperl-ts/dist/esm/zeroperl.wasm', import.meta.url))) }
const file = new File([await readFile('../../fixtures/sony-a100.arw')], 'a.arw')
const r = await parseMetadata(file, { args: ['-json', '-G1'], fetch: fetchWasm, transform: JSON.parse })
console.log({ ok: r.success, tags: r.success && Object.keys(r.data[0]).length, wasmFetches, err: r.error })
