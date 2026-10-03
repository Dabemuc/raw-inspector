/** Directory a tag id is interpreted in; ids overlap between contexts. */
export type TagContext = 'tiff' | 'exif' | 'gps' | 'interop'

export interface Rational {
  num: number
  den: number
}

/** Decoded (possibly truncated) field data handed to value formatters. */
export interface TagValue {
  type: string
  /** Total item count of the field (items may hold fewer). */
  count: number
  /** Decoded numbers/rationals; empty for ASCII. */
  items: (number | Rational)[]
  /** ASCII text without terminator (ASCII fields only). */
  text?: string
  littleEndian: boolean
}

/** Returns a formatted value, or undefined to fall back to the raw summary. */
export type TagFormatter = (value: TagValue) => string | undefined

export interface TagInfo {
  name: string
  description?: string
  format?: TagFormatter
}

/** Compact dictionary entry: [id, name, formatter?, description?]. */
export type TagDef = [number, string, TagFormatter?, string?]
