// Downloads the real RAW sample files listed in fixtures/manifest.json.
// Idempotent: files that already exist with a matching SHA-256 are skipped.
import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { readFile, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures')
const manifest = JSON.parse(await readFile(join(dir, 'manifest.json'), 'utf8'))
const sha256 = (buf) => createHash('sha256').update(buf).digest('hex')

let failed = 0
for (const sample of manifest.samples) {
  const target = join(dir, sample.name)
  if (existsSync(target) && sha256(await readFile(target)) === sample.sha256) {
    console.log(`ok       ${sample.name}`)
    continue
  }
  try {
    console.log(`fetching ${sample.name} (${sample.camera})`)
    const res = await fetch(manifest.baseUrl + sample.path)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const buf = Buffer.from(await res.arrayBuffer())
    const actual = sha256(buf)
    if (actual !== sample.sha256) {
      throw new Error(
        `SHA-256 mismatch (expected ${sample.sha256}, got ${actual})`,
      )
    }
    await writeFile(`${target}.part`, buf)
    await rename(`${target}.part`, target)
    console.log(`ok       ${sample.name}`)
  } catch (err) {
    failed++
    await rm(`${target}.part`, { force: true })
    console.error(`FAILED   ${sample.name}: ${err.message}`)
  }
}
if (failed > 0) process.exit(1)
