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
  it('emits decode with half-size by default', async () => {
    const w = mount(DecodePanel, { props: { ...base } })
    await w.get('[data-testid="decode-button"]').trigger('click')
    expect(w.emitted('decode')![0]).toEqual([{ halfSize: true }])
  })

  it('emits full-size when selected', async () => {
    const w = mount(DecodePanel, { props: { ...base } })
    await w.findAll('input')[1]!.setValue(true)
    await w.get('[data-testid="decode-button"]').trigger('click')
    expect(w.emitted('decode')![0]).toEqual([{ halfSize: false }])
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

  it('shows errors and keeps the button', () => {
    const w = mount(DecodePanel, {
      props: { ...base, status: 'error', error: 'Unsupported' },
    })
    expect(w.get('[data-testid="decode-error"]').text()).toBe('Unsupported')
    expect(w.find('[data-testid="decode-button"]').exists()).toBe(true)
  })
})
