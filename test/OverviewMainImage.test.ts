import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import OverviewMainImage from '../src/components/OverviewMainImage.vue'
import { createMemoryReader } from '../src/core/io'

const previews = [
  {
    nodeId: 'a',
    offset: 0,
    length: 100,
    width: 160,
    height: 120,
    mime: 'image/jpeg',
  },
  {
    nodeId: 'b',
    offset: 100,
    length: 400,
    width: 1600,
    height: 1200,
    mime: 'image/jpeg',
  },
] as const
const image = { width: 2, height: 2, rgba: new Uint8ClampedArray(16) }

function mountIt(props: Record<string, unknown> = {}) {
  return mount(OverviewMainImage, {
    props: {
      reader: createMemoryReader(new Uint8Array(1024)),
      fileName: 'IMG_1.ARW',
      previews: [...previews],
      status: 'decoding',
      progress: 'unpacking',
      image: null,
      error: null,
      fullResolution: false,
      ...props,
    },
  })
}

describe('OverviewMainImage', () => {
  beforeEach(() => {
    let n = 0
    URL.createObjectURL = vi.fn(() => `blob:test/${n++}`)
    URL.revokeObjectURL = vi.fn()
  })

  it('shows the largest preview with a stage badge while rendering', async () => {
    const w = mountIt()
    await flushPromises()
    expect(w.find('[data-testid="viewer-image"]').exists()).toBe(true)
    expect(w.get('[data-testid="render-badge-text"]').text()).toContain(
      'Rendering RAW… (unpacking)',
    )
    expect(
      w.findAll('[data-testid="source-preview"]')[1].attributes('aria-pressed'),
    ).toBe('true')
  })

  it('swaps to the render when the decoded image arrives', async () => {
    const w = mountIt()
    await flushPromises()
    await w.setProps({ status: 'done', progress: null, image })
    expect(w.find('[data-testid="decode-canvas"]').exists()).toBe(true)
    expect(w.find('[data-testid="viewer-image"]').exists()).toBe(false)
    expect(w.find('[data-testid="render-badge"]').exists()).toBe(false)
  })

  it('offers Render RAW when idle or failed, keeping the preview', async () => {
    const w = mountIt({ status: 'error', error: 'Unsupported' })
    await flushPromises()
    expect(w.find('[data-testid="viewer-image"]').exists()).toBe(true)
    expect(w.get('[data-testid="decode-error"]').text()).toBe('Unsupported')
    await w.get('[data-testid="decode-button"]').trigger('click')
    expect(w.emitted('render')).toHaveLength(1)
  })

  it('falls back to the decode panel without previews', () => {
    const w = mountIt({ previews: [] })
    expect(w.find('[data-testid="viewer-image"]').exists()).toBe(false)
    expect(w.find('[data-testid="source-render"]').exists()).toBe(false)
    expect(w.get('[data-testid="decode-progress"]').text()).toContain(
      'Unpacking',
    )
  })

  it('switches source between the render and each preview', async () => {
    const w = mountIt({ status: 'done', progress: null, image })
    await flushPromises()
    expect(w.find('[data-testid="decode-canvas"]').exists()).toBe(true)
    const tabs = w.findAll('[data-testid="source-preview"]')
    expect(tabs[0].text()).toContain('160×120')
    expect(tabs[1].text()).toContain('1600×1200')
    await tabs[0].trigger('click')
    await flushPromises()
    expect(w.find('[data-testid="decode-canvas"]').exists()).toBe(false)
    const dl = w.get('[data-testid="download-jpeg"]')
    expect(dl.attributes('download')).toBe('IMG_1-preview-160x120.jpg')
    await w.get('[data-testid="source-render"]').trigger('click')
    expect(w.find('[data-testid="decode-canvas"]').exists()).toBe(true)
    expect(w.find('[data-testid="download-png"]').exists()).toBe(true)
  })
})
