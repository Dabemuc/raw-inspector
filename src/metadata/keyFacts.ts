import type { MetadataResult, MetadataTag } from './types'

export type KeyFactGroup =
  'Camera' | 'Captured' | 'Exposure' | 'Image' | 'File' | 'GPS'

export interface KeyFact {
  id: string
  group: KeyFactGroup
  label: string
  value: string
  /** Outbound link shown next to the value; never fetched automatically. */
  href?: string
  linkLabel?: string
  /** Where the value came from, so it can be linked to its bytes. */
  source?: FactSource
}

/** The metadata group and tag a fact was read from. */
export interface FactSource {
  group: string
  tag: MetadataTag
}

/** Facts that come from outside the metadata result. */
export interface KeyFactsContext {
  /** Detected format name, e.g. "Sony ARW". */
  format?: string | null
  /** File size in bytes. */
  fileSize?: number | null
}

/**
 * A tag candidate: "Group:Name" or "*:Name" (any group). Candidates are tried
 * in order; within one candidate the first group in result order wins.
 */
type Candidate = string

function findLocated(
  result: MetadataResult,
  candidates: Candidate[],
): FactSource | null {
  for (const c of candidates) {
    const [group, name] = c.split(':') as [string, string]
    for (const g of result.groups) {
      if (group !== '*' && g.name !== group) continue
      const tag = g.tags.find((t) => t.name === name && t.value !== '')
      if (tag) return { group: g.name, tag }
    }
  }
  return null
}

function findTag(
  result: MetadataResult,
  candidates: Candidate[],
): MetadataTag | null {
  return findLocated(result, candidates)?.tag ?? null
}

function src(result: MetadataResult, c: Candidate[]): Partial<KeyFact> {
  const source = findLocated(result, c)
  return source ? { source } : {}
}

function findText(result: MetadataResult, c: Candidate[]): string | null {
  const v = findTag(result, c)?.value.trim()
  return v ? v : null
}

const NUM = /^\s*(?:f\/)?([+-]?\d+(?:\.\d+)?)(?:\s*\/\s*(\d+(?:\.\d+)?))?/

/** Parses "2.8", "28/10", "50.0 mm" or a numeric raw; NaN-safe (null). */
function parseNumber(text: string | number | undefined | null): number | null {
  if (typeof text === 'number') return Number.isFinite(text) ? text : null
  if (!text) return null
  const m = NUM.exec(text)
  if (!m) return null
  const n = Number(m[1])
  const d = m[2] === undefined ? 1 : Number(m[2])
  if (d === 0) return null
  const v = n / d
  return Number.isFinite(v) ? v : null
}

function tagNumber(
  result: MetadataResult,
  c: Candidate[],
  preferRaw = true,
): number | null {
  for (const cand of c) {
    const tag = findTag(result, [cand])
    if (!tag) continue
    const n =
      (preferRaw && typeof tag.raw === 'number' ? tag.raw : null) ??
      parseNumber(tag.value)
    if (n !== null) return n
  }
  return null
}

function trim(n: number, digits: number): string {
  return String(Number(n.toFixed(digits)))
}

export function formatShutter(t: number): string {
  if (t <= 0) return ''
  if (t >= 1) return `${trim(t, 1)} s`
  return `1/${Math.round(1 / t)} s`
}

const signed = (n: number, digits: number) =>
  `${n > 0 ? '+' : ''}${trim(n, digits)}`

function parseDms(tag: MetadataTag): number | null {
  if (typeof tag.raw === 'number') return Math.abs(tag.raw)
  const parts = tag.value.includes(',')
    ? tag.value.split(',').map((p) => parseNumber(p))
    : (tag.value.match(/\d+(?:\.\d+)?/g) ?? []).map(Number)
  if (parts.length === 0 || parts.some((p) => p === null)) return null
  const [d = 0, m = 0, s = 0] = parts as number[]
  return Math.abs(d) + m / 60 + s / 3600
}

function coordinate(
  result: MetadataResult,
  name: 'GPSLatitude' | 'GPSLongitude',
  negativeRef: string,
): number | null {
  const tag = findTag(result, [`Composite:${name}`, `*:${name}`])
  if (!tag) return null
  const abs = parseDms(tag)
  if (abs === null) return null
  const ref = findText(result, [`*:${name}Ref`]) ?? ''
  const negative =
    (typeof tag.raw === 'number' && tag.raw < 0) ||
    ref.toUpperCase().startsWith(negativeRef) ||
    new RegExp(`${negativeRef}\\s*$`).test(tag.value)
  return negative ? -abs : abs
}

/** "52.50000° N" style text for a signed coordinate. */
function formatCoordinate(v: number, pos: string, neg: string): string {
  return `${Math.abs(v).toFixed(5)}° ${v < 0 ? neg : pos}`
}

export function osmLink(lat: number, lon: number): string {
  const la = lat.toFixed(5)
  const lo = lon.toFixed(5)
  return `https://www.openstreetmap.org/?mlat=${la}&mlon=${lo}#map=15/${la}/${lo}`
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} bytes`
  const units = ['KiB', 'MiB', 'GiB']
  let v = n
  let i = -1
  do {
    v /= 1024
    i++
  } while (v >= 1024 && i < units.length - 1)
  return `${trim(v, 1)} ${units[i]}`
}

function dimensions(result: MetadataResult): [number, number] | null {
  const size = findText(result, ['Composite:ImageSize'])
  const m = size && /(\d+)\s*[x×]\s*(\d+)/i.exec(size)
  if (m) return [Number(m[1]), Number(m[2])]
  const pairs = [
    ['*:ExifImageWidth', '*:ExifImageHeight'],
    ['*:SourceImageWidth', '*:SourceImageHeight'],
    ['*:ImageWidth', '*:ImageHeight'],
  ] as const
  for (const [w, h] of pairs) {
    const width = tagNumber(result, [w])
    const height = tagNumber(result, [h])
    if (width && height) return [width, height]
  }
  return null
}

/**
 * Picks the most important facts out of engine or parser-fallback metadata.
 * Facts that cannot be found are left out.
 */
export function buildKeyFacts(
  result: MetadataResult | null,
  ctx: KeyFactsContext = {},
): KeyFact[] {
  const facts: KeyFact[] = []
  const add = (
    group: KeyFactGroup,
    id: string,
    label: string,
    value: string | null | undefined,
    extra: Partial<KeyFact> = {},
  ) => {
    if (value) facts.push({ id, group, label, value, ...extra })
  }

  if (result) {
    const make = findText(result, ['IFD0:Make', '*:Make'])
    const model = findText(result, ['IFD0:Model', '*:Model'])
    const camera =
      make && model && !model.toLowerCase().startsWith(make.toLowerCase())
        ? `${make} ${model}`
        : (model ?? make)
    add(
      'Camera',
      'camera',
      'Camera',
      camera,
      src(result, model ? ['IFD0:Model', '*:Model'] : ['IFD0:Make', '*:Make']),
    )
    const lensTags = [
      'Composite:LensID',
      '*:LensModel',
      '*:LensType',
      '*:LensID',
      '*:Lens',
    ]
    add(
      'Camera',
      'lens',
      'Lens',
      findText(result, lensTags),
      src(result, lensTags),
    )

    const dateTags = [
      '*:DateTimeOriginal',
      '*:CreateDate',
      'IFD0:DateTime',
      '*:DateTime',
    ]
    const date = findText(result, dateTags)
    if (date) {
      const offset = findText(result, [
        '*:OffsetTimeOriginal',
        '*:OffsetTimeDigitized',
        '*:OffsetTime',
      ])
      const hasZone = /(?:[+-]\d{2}:\d{2}|Z)$/.test(date)
      add(
        'Captured',
        'captured',
        'Captured',
        offset && !hasZone ? `${date} ${offset}` : date,
        src(result, dateTags),
      )
    }

    const shutterTags = ['*:ExposureTime', 'Composite:ShutterSpeed']
    const shutter = tagNumber(result, shutterTags)
    add(
      'Exposure',
      'shutter',
      'Shutter',
      shutter ? formatShutter(shutter) : null,
      src(result, shutterTags),
    )
    const fnumTags = ['*:FNumber', 'Composite:Aperture']
    const fnum = tagNumber(result, fnumTags)
    add(
      'Exposure',
      'aperture',
      'Aperture',
      fnum ? `f/${trim(fnum, 1)}` : null,
      src(result, fnumTags),
    )
    const isoTags = ['*:ISO', '*:ISOSpeedRatings', '*:RecommendedExposureIndex']
    const iso = tagNumber(result, isoTags)
    add(
      'Exposure',
      'iso',
      'ISO',
      iso ? String(Math.round(iso)) : null,
      src(result, isoTags),
    )
    const evTags = ['*:ExposureCompensation', '*:ExposureBiasValue']
    const ev = tagNumber(result, evTags)
    add(
      'Exposure',
      'ev',
      'Exposure comp.',
      ev === null ? null : `${signed(ev, 2)} EV`,
      src(result, evTags),
    )
    const focal = tagNumber(result, ['*:FocalLength'])
    const eq = tagNumber(result, ['*:FocalLengthIn35mmFormat'])
    add(
      'Exposure',
      'focal',
      'Focal length',
      focal
        ? `${trim(focal, 1)} mm${eq ? ` (${trim(eq, 0)} mm equiv.)` : ''}`
        : null,
      src(result, ['*:FocalLength']),
    )

    const dim = dimensions(result)
    if (dim) {
      const mp = (dim[0] * dim[1]) / 1e6
      add(
        'Image',
        'dimensions',
        'Dimensions',
        `${dim[0]} × ${dim[1]} (${trim(mp, 1)} MP)`,
      )
    }
    const bits = tagNumber(result, ['*:BitsPerSample', '*:RawBitDepth'])
    add('Image', 'bits', 'Bit depth', bits ? `${Math.round(bits)} bit` : null)
  }

  add('File', 'format', 'Format', ctx.format)
  if (typeof ctx.fileSize === 'number')
    add('File', 'size', 'File size', formatBytes(ctx.fileSize))

  if (result) {
    const lat = coordinate(result, 'GPSLatitude', 'S')
    const lon = coordinate(result, 'GPSLongitude', 'W')
    if (lat !== null && lon !== null) {
      add(
        'GPS',
        'gps',
        'Position',
        `${formatCoordinate(lat, 'N', 'S')}, ${formatCoordinate(lon, 'E', 'W')}`,
        {
          href: osmLink(lat, lon),
          linkLabel: 'Open map',
          ...src(result, ['GPS:GPSLatitude', 'GPSIFD:GPSLatitude']),
        },
      )
      const alt = tagNumber(result, ['*:GPSAltitude'])
      if (alt !== null) {
        const ref = findTag(result, ['*:GPSAltitudeRef'])
        const below =
          ref !== null &&
          (ref.raw === 1 || ref.value === '1' || /below/i.test(ref.value))
        add(
          'GPS',
          'altitude',
          'Altitude',
          `${trim(Math.abs(alt), 1)} m${below ? ' below sea level' : ''}`,
        )
      }
    }
  }
  return facts
}
