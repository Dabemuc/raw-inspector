import type { StructureNode } from '../../../core/model'
import type { ImageClass } from '../imageData'

/** What the walker saw in one IFD, kept for format-specific labelling. */
export interface IfdRecord {
  nodeId: string
  label: string
  /** True for IFD0, IFD1, … of the main chain. */
  topLevel: boolean
  /** Main image class of the IFD (raw wins over previews). */
  role?: ImageClass
  /** CR2Slice (0xC640) values. */
  cr2Slice?: number[]
}

/** Facts collected while walking a TIFF, used for detection and quirks. */
export interface TiffMeta {
  magic: number
  cr2: boolean
  dng: boolean
  make?: string
  model?: string
  ifds: IfdRecord[]
}

export const newMeta = (): TiffMeta => ({
  magic: 42,
  cr2: false,
  dng: false,
  ifds: [],
})

const ROLE_LABEL: Record<ImageClass, string> = {
  raw: 'Raw image',
  preview: 'Preview',
  thumbnail: 'Thumbnail',
}

/** Relabels IFD nodes according to the role they play in the given format. */
export function applyQuirks(
  formatId: string,
  meta: TiffMeta,
  nodes: Record<string, StructureNode>,
): void {
  const rename = (rec: IfdRecord, suffix: string) => {
    nodes[rec.nodeId]!.label = `${rec.label} (${suffix})`
  }
  for (const rec of meta.ifds) {
    const node = nodes[rec.nodeId]!
    if (rec.cr2Slice && rec.cr2Slice.length >= 3) {
      const [count, width, lastWidth] = rec.cr2Slice as [number, number, number]
      node.details = {
        ...node.details,
        cr2Slice: rec.cr2Slice.join(','),
        cr2SliceCount: count,
        cr2SliceWidth: width,
        cr2SliceLastWidth: lastWidth,
      }
    }
    switch (formatId) {
      case 'cr2':
        if (rec.topLevel && rec.label === 'IFD3') rename(rec, 'Raw IFD')
        break
      case 'nef':
      case 'arw':
        if (rec.role === 'raw') rename(rec, ROLE_LABEL.raw)
        break
      case 'dng':
        if (rec.role) rename(rec, ROLE_LABEL[rec.role])
        break
    }
  }
}
