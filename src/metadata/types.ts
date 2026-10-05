/** Coarse origin of a metadata group, used to section the Overview. */
export type MetadataFamily =
  | 'File'
  | 'EXIF'
  | 'MakerNotes'
  | 'XMP'
  | 'IPTC'
  | 'ICC'
  | 'Composite'
  | 'Other'

/** One metadata tag. Plain data, structured-cloneable. */
export interface MetadataTag {
  /** Tag name as the engine/dictionary reports it, e.g. "ExposureTime". */
  name: string
  /** Human readable label, e.g. "Exposure Time". */
  description?: string
  /** Formatted value for display, e.g. "1/250". */
  value: string
  /** Unformatted value (e.g. 0.004), where known. */
  raw?: string | number | boolean | (string | number)[]
  /** Numeric tag id, where the source reports it. */
  tagId?: number
}

/** A named set of tags, e.g. one IFD or one maker-note block. */
export interface MetadataGroup {
  /** Unique id within a result, e.g. "EXIF:IFD0". */
  id: string
  /** Coarse family of the group. */
  family: MetadataFamily
  /** Group name, e.g. "IFD0", "ExifIFD", "Sony", "XMP-dc". */
  name: string
  /** Tags in file order. */
  tags: MetadataTag[]
}

/** All metadata of a file, from our parser or from the engine. */
export interface MetadataResult {
  /** `parser`: our structure tree (fallback); `engine`: the metadata engine. */
  source: 'parser' | 'engine'
  /** Engine name and version when `source` is `engine`, e.g. "ExifTool". */
  engine?: string
  /** Groups in display order. */
  groups: MetadataGroup[]
}
