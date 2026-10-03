import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import PreviewGallery from '../src/components/PreviewGallery.vue'
import { useSelection } from '../src/composables/useSelection'
import { createMemoryReader } from '../src/core/io'
import { exampleResult } from '../src/core/model/example'

const sel = useSelection()
let n = 0
let revoke: ReturnType<typeof vi.fn>

const mounted: VueWrapper[] = []

function mountGallery() {
  const reader = createMemoryReader(new Uint8Array(8192))
  const w = mount(PreviewGallery, {
    props: { reader, fileName: 'IMG_1.ARW' },
  })
  mounted.push(w)
  return w
}

describe('PreviewGallery', () => {
  beforeEach(() => {
    n = 0
    revoke = vi.fn()
    URL.createObjectURL = vi.fn(() => `blob:test/${n++}`)
    URL.revokeObjectURL = revoke as unknown as typeof URL.revokeObjectURL
    sel.setParseResult(exampleResult)
  })
  afterEach(() => {
    mounted.splice(0).forEach((w) => w.unmount())
    sel.setParseResult(null)
  })

  it('renders one card per preview', async () => {
    const w = mountGallery()
    await flushPromises()
    expect(w.findAll('[data-testid="preview-card"]')).toHaveLength(
      exampleResult.previews.length,
    )
    expect(w.find('[data-testid="preview-image"]').attributes('src')).toBe(
      'blob:test/0',
    )
    expect(w.text()).toContain('160×120')
    expect(
      w.find('[data-testid="preview-download"]').attributes('download'),
    ).toBe('IMG_1-preview-160x120.jpg')
  })

  it('click selects the node and highlights the card', async () => {
    const w = mountGallery()
    await flushPromises()
    await w.find('[data-testid="preview-card"]').trigger('click')
    expect(sel.selectedNodeId.value).toBe(exampleResult.previews[0].nodeId)
    expect(w.find('[data-testid="preview-card"]').classes()).toContain(
      'selected',
    )
  })

  it('opens full-size view with fit/1:1 toggle', async () => {
    const w = mountGallery()
    await flushPromises()
    await w.find('[data-testid="preview-image"]').trigger('click')
    expect(w.find('[data-testid="preview-full"]').exists()).toBe(true)
    const img = w.find('[data-testid="preview-full"] img')
    expect(img.classes()).toContain('fit')
    await w.find('[data-testid="preview-zoom"]').trigger('click')
    expect(img.classes()).toContain('actual')
  })

  it('shows an error state when the image fails to decode', async () => {
    const w = mountGallery()
    await flushPromises()
    await w.find('[data-testid="preview-image"]').trigger('error')
    expect(w.find('[data-testid="preview-error"]').exists()).toBe(true)
    expect(w.find('[data-testid="preview-image"]').exists()).toBe(false)
  })

  it('revokes object URLs on unmount', async () => {
    const w = mountGallery()
    await flushPromises()
    w.unmount()
    expect(revoke).toHaveBeenCalledWith('blob:test/0')
  })

  it('revokes object URLs when a new file is loaded', async () => {
    const w = mountGallery()
    await flushPromises()
    sel.setParseResult({ ...exampleResult, previews: [] })
    await flushPromises()
    expect(revoke).toHaveBeenCalledWith('blob:test/0')
    expect(w.findAll('[data-testid="preview-card"]')).toHaveLength(0)
  })
})
