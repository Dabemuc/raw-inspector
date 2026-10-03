import { beforeEach, describe, expect, it } from 'vitest'
import { useSelection } from '../../src/composables/useSelection'
import { ancestorsOf, exampleResult } from '../../src/core/model'

const sel = useSelection()
const leaf = Object.values(exampleResult.nodes).find(
  (n) => n.length > 0 && n.parentId !== null && n.childIds.length === 0,
)!

beforeEach(() => sel.setParseResult(exampleResult))

describe('useSelection', () => {
  it('starts empty', () => {
    expect(sel.selectedNodeId.value).toBeNull()
    expect(sel.selectedNode.value).toBeNull()
    expect(sel.selectedPath.value).toEqual([])
    expect(sel.highlightRange.value).toBeNull()
  })

  it('selectNode sets node, path (root first) and highlight', () => {
    sel.selectNode(leaf.id)
    expect(sel.selectedNode.value).toBe(leaf)
    const expected = ancestorsOf(exampleResult, leaf.id)
      .reverse()
      .map((n) => n.id)
    expect(sel.selectedPath.value.map((n) => n.id)).toEqual(expected)
    expect(sel.selectedPath.value[0]!.id).toBe(exampleResult.rootId)
    expect(sel.highlightRange.value).toEqual({
      offset: leaf.offset,
      length: leaf.length,
    })
  })

  it('hoverNode sets and clears hover', () => {
    sel.hoverNode(leaf.id)
    expect(sel.hoveredNodeId.value).toBe(leaf.id)
    sel.hoverNode(null)
    expect(sel.hoveredNodeId.value).toBeNull()
  })

  it('selectOffset resolves to the smallest containing node', () => {
    sel.selectOffset(leaf.offset)
    expect(sel.selectedNodeId.value).toBe(leaf.id)
    expect(sel.selectedRange.value).toBeNull()
  })

  it('selectOffset outside any node selects a one-byte range', () => {
    sel.selectOffset(exampleResult.fileSize + 10)
    expect(sel.selectedNodeId.value).toBeNull()
    expect(sel.selectedRange.value).toEqual({
      offset: exampleResult.fileSize + 10,
      length: 1,
    })
    expect(sel.highlightRange.value).toEqual(sel.selectedRange.value)
  })

  it('selectRange clears node selection and selectNode clears range', () => {
    sel.selectNode(leaf.id)
    sel.selectRange(4, 8)
    expect(sel.selectedNode.value).toBeNull()
    expect(sel.highlightRange.value).toEqual({ offset: 4, length: 8 })
    sel.selectNode(leaf.id)
    expect(sel.selectedRange.value).toBeNull()
  })

  it('clear resets everything', () => {
    sel.selectNode(leaf.id)
    sel.hoverNode(leaf.id)
    sel.clear()
    expect(sel.selectedNodeId.value).toBeNull()
    expect(sel.hoveredNodeId.value).toBeNull()
    expect(sel.selectedRange.value).toBeNull()
  })

  it('loading a new ParseResult resets selection', () => {
    sel.selectNode(leaf.id)
    sel.hoverNode(leaf.id)
    sel.setParseResult({ ...exampleResult })
    expect(sel.selectedNodeId.value).toBeNull()
    expect(sel.hoveredNodeId.value).toBeNull()
    expect(sel.highlightRange.value).toBeNull()
  })
})
