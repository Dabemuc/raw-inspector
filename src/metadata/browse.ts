import type {
  MetadataFamily,
  MetadataGroup,
  MetadataResult,
  MetadataTag,
} from './types'

export const FAMILY_ORDER: MetadataFamily[] = [
  'File',
  'EXIF',
  'MakerNotes',
  'XMP',
  'IPTC',
  'ICC',
  'Composite',
  'Other',
]

/** Groups ordered by family (stable within a family). */
export function orderGroups(groups: MetadataGroup[]): MetadataGroup[] {
  const rank = (g: MetadataGroup) => FAMILY_ORDER.indexOf(g.family)
  return groups
    .map((g, i) => ({ g, i }))
    .sort((a, b) => rank(a.g) - rank(b.g) || a.i - b.i)
    .map(({ g }) => g)
}

export function rawText(tag: MetadataTag): string {
  const raw = tag.raw
  if (raw === undefined) return ''
  return Array.isArray(raw) ? raw.join(' ') : String(raw)
}

export function tagMatches(tag: MetadataTag, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  return [tag.name, tag.description ?? '', tag.value].some((s) =>
    s.toLowerCase().includes(q),
  )
}

/** Groups reduced to matching tags; groups without a match are dropped. */
export function filterGroups(
  groups: MetadataGroup[],
  query: string,
): MetadataGroup[] {
  if (!query.trim()) return groups
  return groups
    .map((g) => ({ ...g, tags: g.tags.filter((t) => tagMatches(t, query)) }))
    .filter((g) => g.tags.length > 0)
}

export function countTags(groups: MetadataGroup[]): number {
  return groups.reduce((n, g) => n + g.tags.length, 0)
}

export function toJson(result: MetadataResult): string {
  return JSON.stringify(result, null, 2)
}

function csvCell(s: string): string {
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/** CSV with header `group,name,value,raw`. */
export function toCsv(result: MetadataResult): string {
  const rows = ['group,name,value,raw']
  for (const g of result.groups) {
    for (const t of g.tags) {
      rows.push([g.name, t.name, t.value, rawText(t)].map(csvCell).join(','))
    }
  }
  return rows.join('\n') + '\n'
}

/** `IMG_1.ARW` + `json` -> `IMG_1.metadata.json`. */
export function exportFileName(fileName: string, ext: 'json' | 'csv'): string {
  const base = fileName.replace(/\.[^./\\]+$/, '') || 'metadata'
  return `${base}.metadata.${ext}`
}

export function downloadText(name: string, text: string, mime: string) {
  const url = URL.createObjectURL(new Blob([text], { type: mime }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  URL.revokeObjectURL(url)
}
