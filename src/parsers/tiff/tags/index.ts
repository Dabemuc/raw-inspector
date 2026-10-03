import { EXIF_TAGS } from './exif'
import { GPS_TAGS } from './gps'
import { INTEROP_TAGS } from './interop'
import { TIFF_TAGS } from './tiff'
import type { TagContext, TagDef, TagInfo, TagValue } from './types'
import { hex16 } from '../../../core/binary'

export type { Rational, TagContext, TagInfo, TagValue } from './types'

function dictionary(defs: TagDef[]): Map<number, TagInfo> {
  const map = new Map<number, TagInfo>()
  for (const [id, name, format, description] of defs) {
    map.set(id, {
      name,
      ...(description !== undefined && { description }),
      ...(format && { format }),
    })
  }
  return map
}

const DICTIONARIES: Record<TagContext, Map<number, TagInfo>> = {
  tiff: dictionary(TIFF_TAGS),
  exif: dictionary(EXIF_TAGS),
  gps: dictionary(GPS_TAGS),
  interop: dictionary(INTEROP_TAGS),
}

/** Looks a tag up in the dictionary of its directory context. */
export function lookupTag(
  context: TagContext,
  id: number,
): TagInfo | undefined {
  return DICTIONARIES[context].get(id)
}

/** Tag name, or `Unknown (0xABCD)` if the id is not in the dictionary. */
export function tagName(context: TagContext, id: number): string {
  return lookupTag(context, id)?.name ?? `Unknown (${hex16(id)})`
}

/**
 * Formatted value for a tag, or undefined if the tag has no formatter or the
 * formatter does not understand the value (callers fall back to the summary).
 */
export function formatTagValue(
  context: TagContext,
  id: number,
  value: TagValue,
): string | undefined {
  return lookupTag(context, id)?.format?.(value)
}
