import type { ParseResult } from './types'

export type IssueSeverity = 'broken' | 'warning'

/** One problem found in a file, optionally tied to a node. */
export interface Issue {
  severity: IssueSeverity
  nodeId: string | null
  message: string
}

/**
 * Collects `ParseResult.warnings` plus the messages of all warning/broken
 * nodes, de-duplicated, broken first.
 */
export function collectIssues(result: ParseResult): Issue[] {
  const seen = new Set<string>()
  const issues: Issue[] = []
  const add = (severity: IssueSeverity, nodeId: string | null, m: string) => {
    const key = `${nodeId}\u0000${m}`
    if (seen.has(key)) return
    seen.add(key)
    issues.push({ severity, nodeId, message: m })
  }
  for (const node of Object.values(result.nodes)) {
    if (node.status === 'ok') continue
    const messages = node.messages.length
      ? node.messages
      : [`${node.label}: ${node.status}`]
    for (const m of messages) add(node.status, node.id, m)
  }
  for (const w of result.warnings) {
    const status = w.nodeId ? result.nodes[w.nodeId]?.status : undefined
    add(status === 'broken' ? 'broken' : 'warning', w.nodeId, w.message)
  }
  return issues.sort(
    (a, b) => Number(b.severity === 'broken') - Number(a.severity === 'broken'),
  )
}

export type FileProblem = 'empty' | 'too-small' | 'unsupported'

/** Smallest size that can hold a TIFF header. */
export const MIN_FILE_SIZE = 8

/** Whole-file problem that deserves a full-screen message, if any. */
export function fileProblem(result: ParseResult): FileProblem | null {
  if (result.fileSize === 0) return 'empty'
  if (result.fileSize < MIN_FILE_SIZE) return 'too-small'
  if (!result.format) return 'unsupported'
  return null
}
