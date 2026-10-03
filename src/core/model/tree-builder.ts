import type {
  FormatInfo,
  NodeDetails,
  NodeKind,
  NodeStatus,
  ParseResult,
  ParseWarning,
  PreviewInfo,
  Region,
  StructureNode,
} from './types'

/** Input for {@link TreeBuilder.addNode}. */
export interface NewNode {
  kind: NodeKind
  label: string
  offset: number
  length: number
  /** Parent id; omit/null only for the root node. */
  parentId?: string | null
  /** Defaults to 'ok'. */
  status?: NodeStatus
  /** Defaults to none. */
  messages?: string[]
  details?: NodeDetails
}

/** Helper parsers use to build a {@link ParseResult} consistently. */
export class TreeBuilder {
  private readonly nodes: Record<string, StructureNode> = {}
  private readonly regions: Region[] = []
  private readonly previews: PreviewInfo[] = []
  private readonly warnings: ParseWarning[] = []
  private format: FormatInfo | null = null
  private rootId: string | null = null
  private counter = 0

  private readonly fileSize: number

  constructor(fileSize: number) {
    this.fileSize = fileSize
  }

  /**
   * Adds a node, generating its id and linking it to its parent.
   * The first node must have no parent and becomes the root.
   * Status is never propagated to or from other nodes.
   * @returns the new node's id
   */
  addNode(input: NewNode): string {
    const parentId = input.parentId ?? null
    if (parentId === null) {
      if (this.rootId !== null) throw new Error('Root node already exists')
    } else if (!this.nodes[parentId]) {
      throw new Error(`Unknown parent node: ${parentId}`)
    }
    const id = `n${this.counter++}`
    const node: StructureNode = {
      id,
      kind: input.kind,
      label: input.label,
      offset: input.offset,
      length: input.length,
      parentId,
      childIds: [],
      status: input.status ?? 'ok',
      messages: input.messages ? [...input.messages] : [],
    }
    if (input.details) node.details = { ...input.details }
    this.nodes[id] = node
    if (parentId === null) this.rootId = id
    else this.nodes[parentId].childIds.push(id)
    return id
  }

  /** Adds a byte region owned by an existing node. */
  addRegion(region: Region): void {
    this.requireNode(region.nodeId)
    this.regions.push({ ...region })
  }

  /** Adds a displayable preview described by an existing node. */
  addPreview(preview: PreviewInfo): void {
    this.requireNode(preview.nodeId)
    this.previews.push({ ...preview })
  }

  /** Records a parse warning, optionally tied to a node. */
  addWarning(nodeId: string | null, message: string): void {
    if (nodeId !== null) this.requireNode(nodeId)
    this.warnings.push({ nodeId, message })
  }

  /** Sets the detected format. */
  setFormat(format: FormatInfo | null): void {
    this.format = format
  }

  /** Produces the final result. Throws if no root node was added. */
  build(): ParseResult {
    if (this.rootId === null) throw new Error('No root node was added')
    return {
      fileSize: this.fileSize,
      format: this.format,
      rootId: this.rootId,
      nodes: this.nodes,
      regions: this.regions,
      previews: this.previews,
      warnings: this.warnings,
    }
  }

  private requireNode(id: string): void {
    if (!this.nodes[id]) throw new Error(`Unknown node: ${id}`)
  }
}
