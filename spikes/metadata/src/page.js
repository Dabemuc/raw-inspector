// Loads a sample in a module worker and prints timings; result is exposed on window.__result.
const worker = new Worker(new URL('./exiftool.worker.js', import.meta.url), { type: 'module' })
const name = new URLSearchParams(location.search).get('file') ?? 'sony-a100.arw'
const t0 = performance.now()
worker.onmessage = (e) => {
  window.__result = { ...e.data, totalMs: Math.round(performance.now() - t0), crossOriginIsolated }
  document.body.textContent = JSON.stringify(window.__result)
}
worker.postMessage(name)
