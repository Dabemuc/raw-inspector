// One cold run in a fresh process: node child.mjs <engine> <file>
// engines: exiftool | exifreader | exifr | none (baseline RSS)
import { readFile } from 'node:fs/promises'
import { basename } from 'node:path'
import { performance } from 'node:perf_hooks'
const [engine, path] = process.argv.slice(2)
const buf = await readFile(path)
const base = process.resourceUsage().maxRSS
const res = { engine, file: basename(path), sizeMB: +(buf.length / 1048576).toFixed(1) }
const groupsOf = (o) => Object.fromEntries(Object.entries(o).map(([g, v]) => [g, v && typeof v === 'object' ? Object.keys(v).length : 1]))
let t = performance.now()
try {
  if (engine === 'exiftool') {
    const { parseMetadata } = await import('@uswriting/exiftool')
    const tImport = performance.now() - t
    const file = new File([buf], res.file)
    const args = ['-json', '-G1', '-a', '-s']
    const tr = (d) => JSON.parse(d)
    const t1 = performance.now()
    const r = await parseMetadata(file, { args, transform: tr })
    res.coldMs = Math.round(performance.now() - t1 + tImport)
    res.ok = r.success; res.error = r.error?.slice?.(0, 200)
    const t2 = performance.now()
    await parseMetadata(file, { args, transform: tr })
    res.warmMs = Math.round(performance.now() - t2)
    if (r.success) {
      const g = {}
      for (const k of Object.keys(r.data[0])) g[k.split(':')[0]] = (g[k.split(':')[0]] ?? 0) + 1
      res.groups = g
    }
  } else if (engine === 'exifreader') {
    const ExifReader = (await import('exifreader')).default
    const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length)
    t = performance.now()
    res.groups = groupsOf(ExifReader.load(ab, { expanded: true }))
    res.coldMs = Math.round(performance.now() - t)
  } else if (engine === 'exifr') {
    const exifr = (await import('exifr')).default
    t = performance.now()
    const x = await exifr.parse(buf, { tiff: true, xmp: true, icc: true, iptc: true, makerNote: true, mergeOutput: false })
    res.groups = groupsOf(x ?? {})
    res.coldMs = Math.round(performance.now() - t)
  }
} catch (e) { res.error = String(e.message ?? e).slice(0, 200) }
res.peakRssMB = Math.round(process.resourceUsage().maxRSS / 1024)
res.baselineRssMB = Math.round(base / 1024)
console.log(JSON.stringify(res))
