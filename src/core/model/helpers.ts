import type { ParseResult, StructureNode } from './types'

/**
 * Finds the node with the smallest non-zero byte span containing `offset`.
 * Ties are broken in favour of the deeper node. Returns null if none match.
 */
export function findSmallestNodeAt(
  result: ParseResult,
  offset: number,
): StructureNode | null {
  let best: StructureNode | null = null
  let bestDepth = -1
  for (const node of Object.values(result.nodes)) {
    if (node.length <= 0) continue
    if (offset < node.offset || offset >= node.offset + node.length) continue
    const depth = ancestorsOf(result, node.id).length
    if (
      best === null ||
      node.length < best.length ||
      (node.length === best.length && depth > bestDepth)
    ) {
      best = node
      bestDepth = depth
    }
  }
  return best
}

/** Returns the ancestors of a node, nearest parent first, root last. */
export function ancestorsOf(result: ParseResult, id: string): StructureNode[] {
  const out: StructureNode[] = []
  let current = result.nodes[id]?.parentId ?? null
  while (current !== null) {
    const node: StructureNode | undefined = result.nodes[current]
    if (!node) break
    out.push(node)
    current = node.parentId
  }
  return out
}
