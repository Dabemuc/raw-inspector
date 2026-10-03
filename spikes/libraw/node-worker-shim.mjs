// Runs a browser-style worker script (self.onmessage/self.postMessage, fetch of '/file') inside a Node worker_thread.
import { parentPort, workerData } from 'node:worker_threads'
import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'

globalThis.self = globalThis
globalThis.postMessage = (m, t) => parentPort.postMessage(m, t)
const realFetch = globalThis.fetch
globalThis.fetch = async (url, ...rest) => {
  if (url instanceof URL || String(url).startsWith('file:')) {
    // Node's fetch has no file: support; emulate what a browser would fetch over HTTP.
    return new Response(await readFile(new URL(url)), { headers: { 'content-type': 'application/wasm' } })
  }
  if (typeof url !== 'string' || !url.startsWith('/')) return realFetch(url, ...rest)
  const b = await readFile(new URL('./samples' + url, import.meta.url))
  return { arrayBuffer: async () => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) }
}
parentPort.on('message', (data) => globalThis.onmessage({ data }))
await import(pathToFileURL(workerData.script).href)
