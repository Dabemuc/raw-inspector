import { createFileReader } from '../core/io'
import { parseFile } from '../parsers'
import type { StructureRequest, StructureResponse } from './protocol'

const scope = self as unknown as {
  onmessage: ((event: MessageEvent<StructureRequest>) => void) | null
  postMessage(message: StructureResponse): void
}

scope.onmessage = async ({ data }) => {
  if (data.type !== 'parse') return
  try {
    const result = await parseFile(createFileReader(data.file), {
      fileName: data.file.name,
    })
    scope.postMessage({ type: 'result', id: data.id, result })
  } catch (error) {
    scope.postMessage({
      type: 'error',
      id: data.id,
      message: error instanceof Error ? error.message : String(error),
    })
  }
}
