// zeroperl-ts picks its WASM loader with `typeof window/document`, which are
// undefined in a worker; shim them so it takes the fetch branch.
// The deep import is not in the package exports; `?url` makes Vite emit the
// 24 MiB WASM as its own asset instead of bundling it (see ADR 0002).
import wasmUrl from '../../node_modules/@6over3/zeroperl-ts/dist/esm/zeroperl.wasm?url'
import { metadataFromExifTool } from '../metadata/exiftool'
import type { ExifToolRecord } from '../metadata/exiftool'
import type { MetadataRequest, MetadataResponse } from './metadata-protocol'

const scope = self as unknown as {
  onmessage: ((event: MessageEvent<MetadataRequest>) => void) | null
  postMessage(message: MetadataResponse): void
}

const g = globalThis as Record<string, unknown>
g.window ??= self
g.document ??= {}

const cancelled = new Set<number>()
const ARGS = ['-json', '-G1', '-a', '-s']

scope.onmessage = async ({ data }) => {
  if (data.type === 'cancel') {
    cancelled.add(data.id)
    return
  }
  const { id, file } = data
  try {
    scope.postMessage({ type: 'progress', id, stage: 'loading' })
    // Lazy: the WASM is only fetched when metadata is requested.
    const { parseMetadata } = await import('@uswriting/exiftool')
    const run = async (extra: string[]) => {
      const r = await parseMetadata(file, {
        args: [...extra, ...ARGS],
        fetch: () => fetch(wasmUrl),
        transform: (text) => JSON.parse(text) as ExifToolRecord[],
      })
      if (!r.success) throw new Error(r.error || 'ExifTool failed')
      return r.data[0] ?? {}
    }
    scope.postMessage({ type: 'progress', id, stage: 'reading' })
    const formatted = await run([])
    if (cancelled.has(id)) return
    // Raw values are optional: keep the formatted result if this run fails.
    const numeric = await run(['-n']).catch(() => undefined)
    if (cancelled.has(id)) return
    scope.postMessage({
      type: 'result',
      id,
      result: metadataFromExifTool(formatted, numeric),
    })
  } catch (error) {
    if (cancelled.has(id)) return
    scope.postMessage({
      type: 'error',
      id,
      message: error instanceof Error ? error.message : String(error),
    })
  }
}
