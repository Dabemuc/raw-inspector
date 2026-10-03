import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import ByteMap from '../src/components/ByteMap.vue'
import { useSelection } from '../src/composables/useSelection'
import { exampleResult } from '../src/core/model/example'

const sel = useSelection()

describe('ByteMap', () => {
  beforeEach(() => sel.setParseResult(exampleResult))
  afterEach(() => sel.setParseResult(null))

  it('renders a segment per top-level region and a legend', () => {
    const w = mount(ByteMap)
    expect(w.findAll('[data-testid="map-segment"]').length).toBeGreaterThan(0)
    expect(w.find('[data-testid="map-legend"]').text()).toContain('Header')
    expect(w.find('[data-testid="map-legend"]').text()).toContain('%')
  })

  it('clicking a segment selects its node', async () => {
    const w = mount(ByteMap)
    const seg = w.find('[data-testid="map-segment"]')
    await seg.trigger('click')
    expect(sel.selectedNodeId.value).toBe(seg.attributes('data-node-id'))
  })

  it('outlines the segment of an externally selected node', async () => {
    const w = mount(ByteMap)
    const segs = w.findAll('[data-testid="map-segment"]')
    const target = segs[segs.length - 1]
    sel.selectNode(target.attributes('data-node-id')!)
    await w.vm.$nextTick()
    const selected = w.findAll('.seg.selected')
    expect(selected).toHaveLength(1)
    expect(selected[0].attributes('data-node-id')).toBe(
      target.attributes('data-node-id'),
    )
  })

  it('shows a tooltip on hover', async () => {
    const w = mount(ByteMap)
    await w.find('[data-testid="map-segment"]').trigger('pointerenter')
    expect(w.find('[data-testid="map-tooltip"]').text()).toContain('offset')
  })

  it('zooms with the buttons and resets', async () => {
    const w = mount(ByteMap)
    const reset = w.find('[data-testid="map-reset"]')
    expect(reset.attributes('disabled')).toBeDefined()
    await w.find('[aria-label="Zoom in"]').trigger('click')
    expect(reset.attributes('disabled')).toBeUndefined()
    await reset.trigger('click')
    expect(reset.attributes('disabled')).toBeDefined()
  })
})
