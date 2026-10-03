import type { FormatInfo } from '../core/model'

const FORMAT_NAMES: Record<string, string> = {
  dng: 'Adobe DNG',
  cr2: 'Canon CR2',
  cr3: 'Canon CR3',
  nef: 'Nikon NEF',
  arw: 'Sony ARW',
  pef: 'Pentax PEF',
  orf: 'Olympus ORF',
  rw2: 'Panasonic RW2',
  raf: 'Fujifilm RAF',
  tiff: 'TIFF',
}

export function formatInfo(
  id: string,
  make?: string,
  model?: string,
): FormatInfo {
  return {
    id,
    name: FORMAT_NAMES[id] ?? id.toUpperCase(),
    ...(make && { make }),
    ...(model && { model }),
  }
}

/** Non-TIFF containers we recognise but cannot walk yet. */
export function detectNonTiff(head: Uint8Array): FormatInfo | null {
  const text = (from: number, to: number) =>
    String.fromCharCode(...head.subarray(from, to))
  if (text(4, 12) === 'ftypcrx ') return formatInfo('cr3', 'Canon')
  if (text(0, 15) === 'FUJIFILMCCD-RAW') return formatInfo('raf', 'FUJIFILM')
  return null
}

export interface TiffClues {
  magic: number
  /** CR2 signature ("CR" at bytes 8-9) present. */
  cr2: boolean
  dng: boolean
  make?: string
  model?: string
}

const EXTENSION_FORMATS = new Set([
  'dng',
  'cr2',
  'nef',
  'arw',
  'pef',
  'orf',
  'rw2',
])

/** File extension (lowercase, no dot) when it names a known RAW format. */
export function extensionHint(fileName?: string): string | undefined {
  const ext = fileName?.split('.').pop()?.toLowerCase()
  return ext && EXTENSION_FORMATS.has(ext) ? ext : undefined
}

const MAKE_FORMATS: [RegExp, string][] = [
  [/^nikon/i, 'nef'],
  [/^sony/i, 'arw'],
  [/^(pentax|ricoh)/i, 'pef'],
  [/^olympus|^om digital/i, 'orf'],
  [/^panasonic/i, 'rw2'],
  [/^canon/i, 'cr2'],
]

/**
 * Classifies a TIFF-based file. Magic bytes and tag values win; the file
 * extension is only a hint when nothing else decides.
 */
export function detectTiffFormat(
  clues: TiffClues,
  fileName?: string,
): FormatInfo {
  const { make, model } = clues
  let id: string | undefined
  if (clues.magic === 0x4f52 || clues.magic === 0x5352) id = 'orf'
  else if (clues.magic === 0x55) id = 'rw2'
  else if (clues.cr2) id = 'cr2'
  else if (clues.dng) id = 'dng'
  else {
    const hint = extensionHint(fileName)
    const byMake = make && MAKE_FORMATS.find(([re]) => re.test(make))?.[1]
    // A Canon TIFF without the CR2 signature is not a CR2.
    if (byMake && byMake !== 'cr2') id = byMake
    else id = hint ?? 'tiff'
  }
  return formatInfo(id, make, model)
}
