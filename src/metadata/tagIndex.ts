import type { ParseResult } from '../core/model'
import type { MetadataTag } from './types'

/**
 * Normalises a TIFF directory name from the parser ("GPSIFD", "SubIFD0",
 * "SubIFD (next 1)") or the engine ("GPS", "SubIFD", "SubIFD2") to one name.
 * Returns null for groups that are not TIFF directories (XMP, Composite,
 * maker notes, …), which can never link to a node.
 */
export function normalizeDirectory(name: string): string | null {
  const base = name.replace(/ \(next \d+\)$/, '')
  if (base === 'GPSIFD' || base === 'GPS') return 'GPS'
  if (base === 'ExifIFD' || base === 'InteropIFD') return base
  if (/^IFD\d+$/.test(base)) return base
  if (base === 'SubIFD0') return 'SubIFD'
  if (/^SubIFD\d*$/.test(base)) return base
  return null
}

/** `(directory, tagId)` and `(directory, tag name)` → entry node id. */
export interface TagIndex {
  byId: Map<string, string>
  byName: Map<string, string>
}

/** Indexes the entry nodes of every IFD in the structure tree. */
export function buildTagIndex(result: ParseResult): TagIndex {
  const index: TagIndex = { byId: new Map(), byName: new Map() }
  for (const ifd of Object.values(result.nodes)) {
    if (ifd.kind !== 'ifd') continue
    const dir = normalizeDirectory(ifd.label)
    if (dir === null) continue
    for (const id of ifd.childIds) {
      const node = result.nodes[id]
      const tagId = node?.details?.tagId
      if (!node || node.kind !== 'entry' || typeof tagId !== 'number') continue
      // Chained IFDs ("next 1") share a name; the first one wins.
      const byId = `${dir}:${tagId}`
      if (!index.byId.has(byId)) index.byId.set(byId, id)
      const byName = `${dir}:${node.label}`
      if (!index.byName.has(byName)) index.byName.set(byName, id)
    }
  }
  return index
}

/**
 * Finds the entry node holding `tag` in the metadata group `group`. Uses the
 * tag id when the source reports one, else the tag name (the engine gives no
 * ids).
 */
export function findTagNode(
  index: TagIndex,
  group: string,
  tag: MetadataTag,
): string | null {
  const dir = normalizeDirectory(group)
  if (dir === null) return null
  if (tag.tagId !== undefined)
    return index.byId.get(`${dir}:${tag.tagId}`) ?? null
  return index.byName.get(`${dir}:${tag.name}`) ?? null
}
