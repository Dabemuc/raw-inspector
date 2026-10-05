import type {
  MetadataFamily,
  MetadataGroup,
  MetadataResult,
  MetadataTag,
} from './types'

/** ExifTool JSON for one file: keys like "Canon:ISO" (`-G1`). */
export type ExifToolRecord = Record<string, unknown>

/** Groups describing the virtual in-WASM file, not the user's file. */
const HIDDEN_GROUPS = new Set(['SourceFile', 'ExifTool', 'System'])

const MAKERNOTE_GROUPS = new Set([
  'Canon',
  'CanonCustom',
  'CanonRaw',
  'Nikon',
  'NikonCapture',
  'NikonCustom',
  'Sony',
  'SonyIDC',
  'Minolta',
  'MinoltaRaw',
  'Olympus',
  'Panasonic',
  'PanasonicRaw',
  'Leica',
  'FujiFilm',
  'FujiIFD',
  'Pentax',
  'Ricoh',
  'Samsung',
  'Sigma',
  'Apple',
  'Casio',
  'Kodak',
  'Sanyo',
  'Phase One',
  'PhaseOne',
  'DJI',
  'GE',
  'HP',
  'Reconyx',
  'Unknown',
])

/** Maps an ExifTool family-1 group name to our coarse family. */
export function familyOf(group: string): MetadataFamily {
  if (group === 'File' || group === 'QuickTime' || group === 'RAF')
    return 'File'
  if (group === 'Composite') return 'Composite'
  if (group.startsWith('XMP')) return 'XMP'
  if (group === 'IPTC') return 'IPTC'
  if (group.startsWith('ICC')) return 'ICC'
  if (
    /^(IFD\d+|SubIFD\d*|ExifIFD|GPS|GPSIFD|InteropIFD|PreviewIFD|IFD0|EXIF|DNG|IFD)$/.test(
      group,
    )
  )
    return 'EXIF'
  if (MAKERNOTE_GROUPS.has(group)) return 'MakerNotes'
  return 'Other'
}

function stringify(value: unknown): string {
  if (typeof value === 'string') return value
  if (Array.isArray(value)) return value.map(stringify).join(', ')
  if (value !== null && typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

function toRaw(value: unknown): MetadataTag['raw'] {
  if (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  )
    return value
  if (
    Array.isArray(value) &&
    value.every((v) => typeof v === 'string' || typeof v === 'number')
  )
    return value as (string | number)[]
  return stringify(value)
}

/**
 * Converts ExifTool `-json -G1 -a -s` output into a `MetadataResult`.
 * `numeric` is the same run with `-n`; when given, it supplies each tag's
 * `raw` value. Tags and groups keep the engine's order; the engine's own
 * bookkeeping groups (System, ExifTool, SourceFile) are dropped.
 */
export function metadataFromExifTool(
  formatted: ExifToolRecord,
  numeric?: ExifToolRecord,
  engine = 'ExifTool',
): MetadataResult {
  const groups = new Map<string, MetadataGroup>()
  for (const [key, value] of Object.entries(formatted)) {
    const colon = key.indexOf(':')
    const group = colon < 0 ? 'Other' : key.slice(0, colon)
    const name = colon < 0 ? key : key.slice(colon + 1)
    if (HIDDEN_GROUPS.has(group) || colon < 0) continue
    let g = groups.get(group)
    if (!g) {
      g = {
        id: `${familyOf(group)}:${group}`,
        family: familyOf(group),
        name: group,
        tags: [],
      }
      groups.set(group, g)
    }
    const tag: MetadataTag = { name, value: stringify(value) }
    if (numeric && key in numeric) tag.raw = toRaw(numeric[key])
    g.tags.push(tag)
  }
  return { source: 'engine', engine, groups: [...groups.values()] }
}
