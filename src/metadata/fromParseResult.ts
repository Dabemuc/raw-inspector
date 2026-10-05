import type { ParseResult, StructureNode } from '../core/model'
import type { MetadataGroup, MetadataResult, MetadataTag } from './types'

/** IFD labels from the walker ("IFD0", "SubIFD (next 1)", ...) → group name. */
function groupName(label: string): string {
  return label.replace(/ \(next \d+\)$/, '')
}

function toTag(node: StructureNode): MetadataTag | null {
  const d = node.details
  if (!d || typeof d.tagId !== 'number') return null
  const raw = d.raw
  const shown = d.value ?? raw
  // The walker quotes ASCII values for the tree; plain text reads better here.
  const value =
    d.type === 'ASCII' && typeof shown === 'string'
      ? shown.replace(/^"(.*)"$/s, '$1')
      : shown
  const tag: MetadataTag = {
    name: node.label,
    value: value === null || value === undefined ? '' : String(value),
    tagId: d.tagId,
  }
  if (typeof raw === 'string' || typeof raw === 'number') tag.raw = raw
  else if (typeof raw === 'boolean') tag.raw = raw
  return tag
}

/**
 * Builds metadata groups from the IFD entries already in the structure tree
 * (IFD0/1…, SubIFD, ExifIFD, GPSIFD, InteropIFD, DNG tags). Cheap and
 * synchronous: shown while the engine runs, or permanently if it fails.
 */
export function metadataFromParseResult(result: ParseResult): MetadataResult {
  const groups: MetadataGroup[] = []
  const seen = new Map<string, number>()
  const visit = (id: string) => {
    const node = result.nodes[id]
    if (!node) return
    if (node.kind === 'ifd') {
      const tags = node.childIds
        .map((c) => result.nodes[c])
        .filter((n): n is StructureNode => !!n && n.kind === 'entry')
        .map(toTag)
        .filter((t): t is MetadataTag => t !== null)
      if (tags.length > 0) {
        const name = groupName(node.label)
        const n = (seen.get(name) ?? 0) + 1
        seen.set(name, n)
        groups.push({
          id: `EXIF:${n === 1 ? name : `${name}#${n}`}`,
          family: 'EXIF',
          name,
          tags,
        })
      }
    }
    node.childIds.forEach(visit)
    // Sub-IFDs hang off entry nodes, which `visit` reaches via childIds.
  }
  visit(result.rootId)
  return { source: 'parser', groups }
}
