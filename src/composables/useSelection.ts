import { computed, ref, shallowRef } from 'vue'
import { ancestorsOf, findSmallestNodeAt } from '../core/model'
import type { ParseResult, StructureNode } from '../core/model'

export interface ByteRange {
  offset: number
  length: number
}

const parseResult = shallowRef<ParseResult | null>(null)
const selectedNodeId = ref<string | null>(null)
const hoveredNodeId = ref<string | null>(null)
const selectedRange = ref<ByteRange | null>(null)

const selectedNode = computed<StructureNode | null>(() => {
  const id = selectedNodeId.value
  return (id !== null && parseResult.value?.nodes[id]) || null
})

/** Ancestors of the selected node, root first (for expanding the tree). */
const selectedPath = computed<StructureNode[]>(() => {
  const result = parseResult.value
  const id = selectedNodeId.value
  if (!result || id === null || !selectedNode.value) return []
  return ancestorsOf(result, id).reverse()
})

/** Byte range to highlight: an explicit range wins over the selected node. */
const highlightRange = computed<ByteRange | null>(() => {
  if (selectedRange.value) return selectedRange.value
  const node = selectedNode.value
  return node ? { offset: node.offset, length: node.length } : null
})

function clear(): void {
  selectedNodeId.value = null
  hoveredNodeId.value = null
  selectedRange.value = null
}

/** Sets the active ParseResult and resets all selection state. */
function setParseResult(result: ParseResult | null): void {
  parseResult.value = result
  clear()
}

function selectNode(id: string): void {
  selectedNodeId.value = id
  selectedRange.value = null
}

function hoverNode(id: string | null): void {
  hoveredNodeId.value = id
}

/** Selects an explicit byte range that is not necessarily a node. */
function selectRange(offset: number, length: number): void {
  selectedNodeId.value = null
  selectedRange.value = { offset, length }
}

/**
 * Selects the smallest node containing `offset`; if none does, selects the
 * single byte as a plain range.
 */
function selectOffset(offset: number): void {
  const result = parseResult.value
  const node = result ? findSmallestNodeAt(result, offset) : null
  if (node) selectNode(node.id)
  else selectRange(offset, 1)
}

export function useSelection() {
  return {
    parseResult,
    selectedNodeId,
    hoveredNodeId,
    selectedRange,
    selectedNode,
    selectedPath,
    highlightRange,
    setParseResult,
    selectNode,
    hoverNode,
    selectRange,
    selectOffset,
    clear,
  }
}
