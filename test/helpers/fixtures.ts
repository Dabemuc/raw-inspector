import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe } from 'vitest'

export interface FixtureSample {
  name: string
  format: string
  camera: string
  path: string
  sha256: string
  size: number
  /** First 8 bytes as hex, incl. the byte-order marker. */
  header: string
}

const fixturesDir = join(__dirname, '..', '..', 'fixtures')

export const fixtureManifest: { baseUrl: string; samples: FixtureSample[] } =
  JSON.parse(readFileSync(join(fixturesDir, 'manifest.json'), 'utf8'))

export function fixturePath(name: string): string {
  return join(fixturesDir, name)
}

export function hasFixture(name: string): boolean {
  return existsSync(fixturePath(name))
}

/** Runs `fn` as a describe block, or skips it with a hint when the file is missing. */
export function describeFixture(
  name: string,
  fn: (path: string) => void,
): void {
  const path = fixturePath(name)
  if (existsSync(path)) {
    describe(`fixture ${name}`, () => fn(path))
  } else {
    describe.skip(`fixture ${name} (missing - run \`npm run fixtures\` to download)`, () =>
      fn(path))
  }
}
