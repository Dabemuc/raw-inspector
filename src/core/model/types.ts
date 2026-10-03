/** What a structure node represents. */
export type NodeKind =
  | 'file'
  | 'header'
  | 'ifd'
  | 'entry'
  | 'value'
  | 'image-data'
  | 'preview'
  | 'thumbnail'
  | 'makernote'
  | 'unknown'

/** Health of a node as determined by the parser. */
export type NodeStatus = 'ok' | 'warning' | 'broken'

/** Scalar details attached to a node (tag id, type, count, value, ...). */
export type NodeDetails = Record<string, string | number | boolean | null>

/** One node of the parsed file structure tree. */
export interface StructureNode {
  /** Unique id within a ParseResult. */
  id: string
  /** What the node represents. */
  kind: NodeKind
  /** Human readable label, e.g. "IFD0" or "ImageWidth". */
  label: string
  /** Absolute byte offset in the file. */
  offset: number
  /** Number of bytes covered by this node itself (not including children). */
  length: number
  /** Id of the parent node, or null for the root. */
  parentId: string | null
  /** Ids of child nodes, in insertion order. */
  childIds: string[]
  /** Parser-assessed health of this node. Never derived from children. */
  status: NodeStatus
  /** Warnings / errors for this node. */
  messages: string[]
  /** Optional format-specific details, e.g. tagId, type, count, value. */
  details?: NodeDetails
}

/** Kind of a byte region in the file map. */
export type RegionKind =
  | 'header'
  | 'ifd'
  | 'value'
  | 'raw-data'
  | 'preview'
  | 'thumbnail'
  | 'makernote'
  | 'unknown'

/** A contiguous byte range of the file attributed to a node, used for hex/map views. */
export interface Region {
  /** Id of the node owning this region. */
  nodeId: string
  /** Kind of the region (drives colouring). */
  kind: RegionKind
  /** Absolute byte offset of the region start. */
  offset: number
  /** Region length in bytes. */
  length: number
}

/** Detected file format. */
export interface FormatInfo {
  /** Stable machine id, e.g. "dng". */
  id: string
  /** Human readable name, e.g. "Adobe DNG". */
  name: string
  /** Camera make, if known. */
  make?: string
  /** Camera model, if known. */
  model?: string
}

/** An embedded JPEG preview that can be displayed. */
export interface PreviewInfo {
  /** Id of the node describing the preview. */
  nodeId: string
  /** Absolute byte offset of the JPEG data. */
  offset: number
  /** JPEG data length in bytes. */
  length: number
  /** Pixel width, if known. */
  width?: number
  /** Pixel height, if known. */
  height?: number
  /** MIME type of the preview data. */
  mime: 'image/jpeg'
}

/** A warning raised while parsing. */
export interface ParseWarning {
  /** Node the warning relates to, or null if file-global. */
  nodeId: string | null
  /** Warning text. */
  message: string
}

/** Complete, structured-cloneable output of a parser. */
export interface ParseResult {
  /** Total file size in bytes. */
  fileSize: number
  /** Detected format, or null if unrecognised. */
  format: FormatInfo | null
  /** Id of the root node. */
  rootId: string
  /** All nodes keyed by id. */
  nodes: Record<string, StructureNode>
  /** Byte regions attributed to nodes. */
  regions: Region[]
  /** Displayable embedded previews. */
  previews: PreviewInfo[]
  /** Parse-level warnings. */
  warnings: ParseWarning[]
}
