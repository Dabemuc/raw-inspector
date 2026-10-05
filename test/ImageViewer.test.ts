import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import ImageViewer from '../src/components/ImageViewer.vue'

const image = { width: 2, height: 2, rgba: new Uint8ClampedArray(16) }

describe('ImageViewer', () => {
  it('downloads a decoded image as PNG', async () => {
    const w = mount(ImageViewer, {
      props: { image, downloadName: 'IMG_1' },
      attachTo: document.body,
    })
    const canvas = w.get('canvas').element as HTMLCanvasElement
    const toBlob = vi.fn()
    canvas.toBlob = toBlob
    await w.get('[data-testid="download-png"]').trigger('click')
    expect(toBlob).toHaveBeenCalledWith(expect.any(Function), 'image/png')
    expect(w.find('[data-testid="download-jpeg"]').exists()).toBe(false)
    w.unmount()
  })

  it('downloads a URL source as the original JPEG', () => {
    const w = mount(ImageViewer, {
      props: { url: 'blob:x', downloadName: 'IMG_1-preview' },
    })
    const a = w.get('[data-testid="download-jpeg"]')
    expect(a.attributes('href')).toBe('blob:x')
    expect(a.attributes('download')).toBe('IMG_1-preview.jpg')
    expect(w.find('[data-testid="download-png"]').exists()).toBe(false)
  })

  it('switches between fit and 1:1 and zooms with the wheel', async () => {
    const w = mount(ImageViewer, { props: { image, downloadName: 'a' } })
    expect(w.get('[data-testid="zoom-fit"]').attributes('aria-pressed')).toBe(
      'true',
    )
    await w.get('[data-testid="zoom-actual"]').trigger('click')
    expect(w.get('canvas').attributes('style')).toContain('width: 2px')
    await w.get('.viewport').trigger('wheel', { deltaY: -100 })
    expect(w.get('canvas').attributes('style')).toContain('width: 2.3px')
    await w.get('[data-testid="zoom-fit"]').trigger('click')
    expect(w.get('canvas').attributes('style')).toBeUndefined()
  })
})
