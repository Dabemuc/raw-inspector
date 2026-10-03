import type { RandomAccessReader } from '../core/io'
import { TreeBuilder, type ParseResult } from '../core/model'
import { applyCoverage } from './coverage'
import { walkTiff } from './tiff'

/** Single entry point for structure parsing; later parsers extend this. */
export async function parseFile(
  reader: RandomAccessReader,
): Promise<ParseResult> {
  const builder = new TreeBuilder(reader.size)
  const rootId = builder.addNode({
    kind: 'file',
    label: 'File',
    offset: 0,
    length: reader.size,
  })

  try {
    await walkTiff(reader, builder, rootId)
  } catch (error) {
    builder.addWarning(
      rootId,
      `Parser stopped unexpectedly: ${error instanceof Error ? error.message : String(error)}`,
    )
  }

  return applyCoverage(reader, builder.build())
}
