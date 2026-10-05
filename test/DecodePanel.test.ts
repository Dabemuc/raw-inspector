import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import DecodePanel from '../src/components/DecodePanel.vue'

const base = {
  status: 'idle',
  progress: null,
  image: null,
  error: null,
  fileName: 'a.dng',
} as const

describe('DecodePanel', () => {
  it('offers an on-demand render when nothing is rendered', async () => {
    const w = mount(DecodePanel, { props: { ...base } })
    await w.get('[data-testid="decode-button"]').trigger('click')
    expect(w.emitted('render')).toHaveLength(1)
  })

  it('offers full resolution while showing the half-size image', async () => {
    const image = {
      width: 2,
      height: 2,
      rgba: new Uint8ClampedArray(16),
    }
    const w = mount(DecodePanel, {
      props: { ...base, status: 'decoding', image, progress: 'processing' },
    })
    expect(w.find('[data-testid="decode-canvas"]').exists()).toBe(true)
    await w.get('[data-testid="render-full"]').trigger('click')
    expect(w.emitted('render-full')).toHaveLength(1)
    await w.setProps({ fullResolution: true })
    expect(w.find('[data-testid="render-full"]').exists()).toBe(false)
  })

  it('shows progress with a cancel button', async () => {
    const w = mount(DecodePanel, {
      props: { ...base, status: 'decoding', progress: 'unpacking' },
    })
    expect(w.get('[data-testid="decode-progress"]').text()).toContain(
      'Unpacking',
    )
    await w.find('button').trigger('click')
    expect(w.emitted('cancel')).toHaveLength(1)
  })

  it('shows errors and keeps the render button', () => {
    const w = mount(DecodePanel, {
      props: { ...base, status: 'error', error: 'Unsupported' },
    })
    expect(w.get('[data-testid="decode-error"]').text()).toBe('Unsupported')
    expect(w.find('[data-testid="decode-button"]').exists()).toBe(true)
  })
})
