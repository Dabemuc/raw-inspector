import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it } from 'vitest'
import StructureTree from '../../src/components/StructureTree.vue'
import { useSelection } from '../../src/composables/useSelection'
import { exampleResult } from '../../src/core/model/example'

const sel = useSelection()
const idOf = (label: string) =>
  Object.values(exampleResult.nodes).find((n) => n.label === label)!.id

const labels = (w: ReturnType<typeof mount>) =>
  w.findAll('[data-testid="tree-row"] .label').map((l) => l.text())

describe('StructureTree', () => {
  beforeEach(() => {
    sel.setParseResult(exampleResult)
  })

  it('renders root and its children, collapsed below', () => {
    const w = mount(StructureTree)
    const l = labels(w)
    expect(l[0]).toContain('example.dng')
    expect(l.some((t) => t.includes('IFD0'))).toBe(true)
    expect(l.some((t) => t.includes('ImageWidth'))).toBe(false)
  })

  it('expands and collapses', async () => {
    const w = mount(StructureTree)
    const ifd = w
      .findAll('[data-testid="tree-row"]')
      .find((r) => r.text().includes('IFD0'))!
    await ifd.find('[data-testid="tree-toggle"]').trigger('click')
    expect(labels(w).some((t) => t.includes('ImageWidth'))).toBe(true)
    await ifd.find('[data-testid="tree-toggle"]').trigger('click')
    expect(labels(w).some((t) => t.includes('ImageWidth'))).toBe(false)
  })

  it('selects on click and hovers on mouseenter', async () => {
    const w = mount(StructureTree)
    const row = w.findAll('[data-testid="tree-row"]')[1]!
    await row.trigger('mouseenter')
    expect(sel.hoveredNodeId.value).toBe(row.attributes('data-node-id'))
    await row.trigger('click')
    expect(sel.selectedNodeId.value).toBe(row.attributes('data-node-id'))
  })

  it('expands ancestors on external selection', async () => {
    const w = mount(StructureTree)
    sel.selectNode(idOf('StripOffsets'))
    await flushPromises()
    const l = labels(w)
    expect(l.some((t) => t.includes('StripOffsets'))).toBe(true)
    expect(w.find('.row.selected').text()).toContain('StripOffsets')
  })

  it('filters by label, tag id and value, keeping ancestors', async () => {
    const w = mount(StructureTree)
    const search = w.find('[data-testid="tree-search"]')
    await search.setValue('exposure')
    expect(labels(w).map((t) => t.replace(/[▾▸●]/g, '').trim())).toEqual([
      'example.dng',
      'IFD0',
      'EXIF IFD',
      'ExposureTime',
    ])
    await search.setValue('0x0100')
    expect(labels(w).some((t) => t.includes('ImageWidth'))).toBe(true)
    await search.setValue('256')
    expect(labels(w).some((t) => t.includes('ImageWidth'))).toBe(true)
    await search.setValue('1/250')
    expect(labels(w).some((t) => t.includes('ExposureTime'))).toBe(true)
    await search.setValue('zzzz')
    expect(w.findAll('[data-testid="tree-row"]')).toHaveLength(0)
  })

  it('shows status icons and aggregate indicators', async () => {
    const w = mount(StructureTree)
    expect(w.find('[data-testid="status-icon"]').exists()).toBe(true)
    expect(w.find('[data-testid="status-aggregate"]').exists()).toBe(true)
  })

  it('toggles decimal offsets', async () => {
    const w = mount(StructureTree)
    expect(w.text()).toContain('0x8')
    await w.find('[data-testid="offset-toggle"]').trigger('click')
    expect(w.text()).not.toContain('0x8')
  })

  it('supports keyboard navigation', async () => {
    const w = mount(StructureTree)
    const sc = w.find('[data-testid="tree-scroller"]')
    await sc.trigger('keydown', { key: 'Enter' })
    expect(sel.selectedNodeId.value).toBe(exampleResult.rootId)
    await sc.trigger('keydown', { key: 'ArrowDown' })
    expect(sel.selectedNode.value?.label).toBe('TIFF Header')
    await sc.trigger('keydown', { key: 'ArrowDown' })
    expect(sel.selectedNode.value?.label).toBe('IFD0')
    await sc.trigger('keydown', { key: 'ArrowRight' })
    expect(labels(w).some((t) => t.includes('ImageWidth'))).toBe(true)
    await sc.trigger('keydown', { key: 'ArrowLeft' })
    expect(labels(w).some((t) => t.includes('ImageWidth'))).toBe(false)
    await sc.trigger('keydown', { key: 'ArrowLeft' })
    expect(sel.selectedNode.value?.label).toBe('example.dng')
  })
})
