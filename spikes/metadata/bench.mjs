// Node benchmark: tag counts per group + timings for each candidate.
// Usage: node bench.mjs [files...]   (default: ../../fixtures/*)
import { readFile, readdir } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { performance } from 'node:perf_hooks'
import { parseMetadata } from '@uswriting/exiftool'
import ExifReader from 'exifreader'
import exifr from 'exifr'

const fx = new URL('../../fixtures/', import.meta.url).pathname
const files = process.argv.length > 2 ? process.argv.slice(2) : (await readdir(fx)).filter((f) => /\.(dng|arw|nef|cr2|cr3|orf|rw2|raf)$/i.test(f)).map((f) => join(fx, f))
const mb = (n) => Math.round(n / 1048576)
const out = {}
for (const path of files) {
  const buf = await readFile(path)
  const file = new File([buf], basename(path))
  const r = { size: buf.length }
  // 1. ExifTool WASM (first call = cold: includes WASM compile + perl init)
  let t = performance.now()
  const et = await parseMetadata(file, { args: ['-json', '-G1', '-a', '-s'], transform: (d) => JSON.parse(d) })
  r.exiftool = { ms: Math.round(performance.now() - t), rssMB: mb(process.memoryUsage().rss), ok: et.success, error: et.error?.slice?.(0, 200) }
  if (et.success) {
    const groups = {}
    for (const k of Object.keys(et.data[0])) { const g = k.split(':')[0]; groups[g] = (groups[g] ?? 0) + 1 }
    r.exiftool.tags = Object.values(groups).reduce((a, b) => a + b, 0)
    r.exiftool.groups = groups
  }
  t = performance.now()
  await parseMetadata(file, { args: ['-json', '-G1', '-a', '-s'], transform: (d) => JSON.parse(d) })
  r.exiftool.warmMs = Math.round(performance.now() - t)
  // 2. ExifReader
  try {
    t = performance.now()
    const tags = ExifReader.load(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length), { expanded: true })
    r.exifreader = { ms: Math.round(performance.now() - t), groups: Object.fromEntries(Object.entries(tags).map(([g, v]) => [g, Object.keys(v).length])) }
  } catch (e) { r.exifreader = { error: String(e.message ?? e) } }
  // 3. exifr (all segments, makernote on)
  try {
    t = performance.now()
    const x = await exifr.parse(buf, { tiff: true, xmp: true, icc: true, iptc: true, jfif: true, ihdr: true, makerNote: true, mergeOutput: false, translateKeys: true, translateValues: true })
    r.exifr = { ms: Math.round(performance.now() - t), groups: Object.fromEntries(Object.entries(x ?? {}).map(([g, v]) => [g, v && typeof v === 'object' ? Object.keys(v).length : 1])) }
  } catch (e) { r.exifr = { error: String(e.message ?? e) } }
  out[basename(path)] = r
  console.error('done', basename(path))
}
console.log(JSON.stringify(out, null, 1))
