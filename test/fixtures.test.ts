import { openSync, readSync, closeSync } from 'node:fs'
import { expect, it } from 'vitest'
import { describeFixture, fixtureManifest } from './helpers/fixtures'

for (const sample of fixtureManifest.samples) {
  describeFixture(sample.name, (path) => {
    it(`starts with the expected ${sample.format} byte-order marker`, () => {
      const buf = Buffer.alloc(8)
      const fd = openSync(path, 'r')
      try {
        readSync(fd, buf, 0, 8, 0)
      } finally {
        closeSync(fd)
      }
      expect(buf.toString('hex')).toBe(sample.header)
      expect(['II', 'MM']).toContain(buf.subarray(0, 2).toString('latin1'))
    })
  })
}
