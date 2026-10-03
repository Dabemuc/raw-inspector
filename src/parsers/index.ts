import type { RandomAccessReader } from '../core/io'
import { TreeBuilder, type ParseResult } from '../core/model'
import { applyCoverage } from './coverage'
import { dropUnknownGaps, scanJpegs } from './scan/jpeg'
import { detectNonTiff, detectTiffFormat } from './detect'
import { walkTiff } from './tiff'
import { applyQuirks, newMeta } from './tiff/quirks'

export interface ParseOptions {
  /** Original file name; its extension is only used as a detection hint. */
  fileName?: string
}

/** Single entry point for structure parsing; later parsers extend this. */
export async function parseFile(
  reader: RandomAccessReader,
  options: ParseOptions = {},
): Promise<ParseResult> {
  const builder = new TreeBuilder(reader.size)
  const rootId = builder.addNode({
    kind: 'file',
    label: 'File',
    offset: 0,
    length: reader.size,
  })

  try {
    const meta = newMeta()
    if (await walkTiff(reader, builder, rootId, meta)) {
      const format = detectTiffFormat(meta, options.fileName)
      builder.setFormat(format)
      applyQuirks(format.id, meta, builder.build().nodes)
    } else {
      const other = detectNonTiff(
        await reader.read(0, Math.min(16, reader.size)),
      )
      if (other) {
        builder.setFormat(other)
        builder.addWarning(
          rootId,
          `Structure parsing for ${other.name} is not supported yet`,
        )
      }
    }
  } catch (error) {
    builder.addWarning(
      rootId,
      `Parser stopped unexpectedly: ${error instanceof Error ? error.message : String(error)}`,
    )
  }

  const result = await applyCoverage(reader, builder.build())
  try {
    if (await scanJpegs(reader, result)) {
      dropUnknownGaps(result)
      return await applyCoverage(reader, result)
    }
  } catch (error) {
    result.warnings.push({
      nodeId: null,
      message: `JPEG scan failed: ${error instanceof Error ? error.message : String(error)}`,
    })
  }
  return result
}
