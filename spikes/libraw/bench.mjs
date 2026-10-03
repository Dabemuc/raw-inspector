// Usage: node bench.mjs [lib=all|colorhythm|yb] [fileFilter] [modes=raw,full,half] [runs=1]
import { spawnSync } from 'node:child_process'
import { readdirSync, writeFileSync, mkdirSync, statSync } from 'node:fs'

const [libArg = 'all', filter = '', modesArg = 'raw,full,half', runs = '1'] = process.argv.slice(2)
const libs = libArg === 'all' ? ['colorhythm', 'yb'] : [libArg]
const files = readdirSync('samples').filter((f) => f.includes(filter)).sort()
const results = []
for (const lib of libs)
  for (const file of files)
    for (const mode of modesArg.split(','))
      for (let i = 0; i < +runs; i++) {
        const t0 = Date.now()
        const r = spawnSync('node', ['--max-old-space-size=4096', 'child.mjs', lib, file, mode], { encoding: 'utf8', timeout: 300000, maxBuffer: 1 << 26 })
        const line = r.stdout.trim().split('\n').pop()
        let row
        try { row = JSON.parse(line) } catch { row = { lib, file, mode, ok: false, error: `crash/timeout (status ${r.status}, signal ${r.signal}) ${r.stderr.slice(-300)}` } }
        row.wallMs = Date.now() - t0
        row.sizeMb = +(statSync('samples/' + file).size / 1e6).toFixed(1)
        results.push(row)
        console.log(JSON.stringify({ lib, file, mode, ok: row.ok, wallMs: row.wallMs, rss: row.maxRssMb, t: row.t, err: row.error }))
      }
mkdirSync('results', { recursive: true })
writeFileSync(`results/${libArg}-${filter || 'all'}-${modesArg}.json`, JSON.stringify(results, null, 2))
