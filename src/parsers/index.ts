import type { RandomAccessReader } from '../core/io'
import { TreeBuilder, type ParseResult } from '../core/model'
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

  let recognised
  try {
    recognised = await walkTiff(reader, builder, rootId)
  } catch (error) {
    builder.addWarning(
      rootId,
      `Parser stopped unexpectedly: ${error instanceof Error ? error.message : String(error)}`,
    )
    recognised = true
  }

  if (!recognised && reader.size > 0) {
    builder.addRegion({
      nodeId: rootId,
      kind: 'unknown',
      offset: 0,
      length: reader.size,
    })
  }
  return builder.build()
}
