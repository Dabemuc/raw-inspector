import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import HexViewer from '../src/components/HexViewer.vue'
import { useSelection } from '../src/composables/useSelection'
import { exampleResult } from '../src/core/model/example'
import type { RandomAccessReader } from '../src/core/io'

const SIZE = 60 * 1024 * 1024

function mockReader(size = SIZE) {
  const read = vi.fn(async (offset: number, length: number) => {
    const out = new Uint8Array(length)
    for (let i = 0; i < length; i++) out[i] = (offset + i) & 0xff
    return out
  })
  const reader: RandomAccessReader = { size, read }
  return { reader, read }
}

const sel = useSelection()

async function settle() {
  await new Promise((r) => setTimeout(r, 0))
}

describe('HexViewer', () => {
  beforeEach(() => {
    sel.setParseResult(exampleResult)
  })

  it('renders few rows and reads only the visible window for a 60 MB file', async () => {
    const { reader, read } = mockReader()
    const w = mount(HexViewer, { props: { reader } })
    await settle()
    expect(w.findAll('[data-testid="hex-row"]').length).toBeLessThan(100)
    expect(w.findAll('[data-testid="hex-row"]').length).toBeGreaterThan(0)
    for (const [offset, length] of read.mock.calls) {
      expect(offset + length).toBeLessThan(100 * 16)
    }
    expect(read.mock.calls.length).toBeLessThan(5)
  })

  it('click selects the smallest containing node', async () => {
    const { reader } = mockReader(4096)
    const w = mount(HexViewer, { props: { reader } })
    await settle()
    const target = Object.values(exampleResult.nodes).find(
      (n) => n.length > 0 && n.offset < 4000 && n.parentId !== null,
    )!
    await w.find(`[data-offset="${target.offset}"]`).trigger('click')
    const containing = Object.values(exampleResult.nodes).filter(
      (n) =>
        n.length > 0 &&
        n.offset <= target.offset &&
        n.offset + n.length > target.offset,
    )
    const min = Math.min(...containing.map((n) => n.length))
    expect(sel.selectedNode.value?.length).toBe(min)
  })

  it('shift-click selects a range and shows length and interpretations', async () => {
    const { reader } = mockReader(4096)
    const w = mount(HexViewer, { props: { reader } })
    await settle()
    await w.find('[data-offset="2"]').trigger('click')
    await w.find('[data-offset="9"]').trigger('click', { shiftKey: true })
    await settle()
    expect(sel.highlightRange.value).toEqual({ offset: 2, length: 8 })
    expect(w.find('[data-testid="hex-length"]').text()).toContain('8 bytes')
    const interp = w.findAll('[data-testid="hex-interp"]').map((e) => e.text())
    expect(interp).toContain('u16 LE: 770')
    expect(interp).toContain('u16 BE: 515')
    expect(interp).toContain(
      'u32 LE: 83951874'.replace('83951874', String(0x05040302)),
    )
  })

  it('go-to-offset scrolls to the offset', async () => {
    const { reader } = mockReader()
    const w = mount(HexViewer, { props: { reader } })
    await settle()
    await w.find('[data-testid="goto-input"]').setValue('0x100000')
    await w.find('form').trigger('submit')
    await settle()
    expect(w.find('[data-offset="1048576"]').exists()).toBe(true)
    expect(sel.highlightRange.value?.offset).toBe(0x100000)
  })

  it('go-to-offset accepts decimal', async () => {
    const { reader } = mockReader()
    const w = mount(HexViewer, { props: { reader } })
    await settle()
    await w.find('[data-testid="goto-input"]').setValue('50000')
    await w.find('form').trigger('submit')
    await settle()
    expect(w.find('[data-offset="50000"]').exists()).toBe(true)
  })

  it('external selection scrolls to the range start', async () => {
    const { reader } = mockReader()
    const w = mount(HexViewer, { props: { reader } })
    await settle()
    sel.selectRange(2_000_000, 4)
    await settle()
    expect(w.find('[data-offset="2000000"]').exists()).toBe(true)
    expect(w.find('[data-offset="0"]').exists()).toBe(false)
  })
})
