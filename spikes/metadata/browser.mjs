// Drives the built spike in headless Chromium: node browser.mjs <file> [url-suffix]
// Requires `npx vite build && npx vite preview` running on :5198 and playwright (npm i -g / /tmp/pw).
import { chromium } from '/tmp/pw/node_modules/playwright/index.mjs'
const file = process.argv[2] ?? 'sony-a100.arw'
const b = await chromium.launch()
const p = await b.newPage()
const reqs = []
p.on('response', (r) => reqs.push(`${r.status()} ${r.url().split('/').pop()} ${r.headers()['content-length'] ?? ''}`))
p.on('console', (m) => console.log('console:', m.text().slice(0, 300)))
p.on('pageerror', (e) => console.log('pageerror:', String(e).slice(0, 300)))
await p.goto(`http://localhost:5198/?file=${file}`)
const r = await p.waitForFunction(() => window.__result, null, { timeout: 60000 }).then((h) => h.jsonValue()).catch((e) => 'timeout ' + e.message.slice(0, 100))
console.log(JSON.stringify(r)); console.log(reqs.filter((x) => !x.includes('arw')).join('\n'))
await b.close()
