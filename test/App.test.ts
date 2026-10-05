import { mount } from '@vue/test-utils'
import { collectIssues } from '../src/core/model'
import { ref, shallowRef } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ParseResult } from '../src/core/model'
import { exampleResult } from '../src/core/model/example'
import type { ParserStatus } from '../src/composables/useStructureParser'

const parse = vi.fn()
const status = ref<ParserStatus>('idle')
const result = shallowRef<ParseResult | null>(null)
const error = ref<string | null>(null)
const errorKind = ref<string | null>(null)

vi.mock('../src/composables/useStructureParser', () => ({
  useStructureParser: () => ({
    parse,
    cancel: vi.fn(),
    status,
    result,
    error,
    errorKind,
  }),
}))

const decode = vi.fn() // never resolves: status stays 'decoding'
const metadataRead = vi.fn()
vi.mock('../src/composables/useMetadata', () => ({
  useMetadata: () => ({
    read: metadataRead,
    cancel: vi.fn(),
    status: ref('loading'),
    result: shallowRef(null),
    error: ref(null),
  }),
}))
vi.mock('../src/composables/useRawDecode', () => ({
  useRawDecode: () => ({
    decode,
    cancel: vi.fn(),
    status: ref('decoding'),
    progress: ref(null),
    image: shallowRef(null),
    metadata: shallowRef(null),
    error: ref(null),
  }),
}))

import App from '../src/App.vue'

describe('App', () => {
  beforeEach(() => {
    parse.mockClear()
    status.value = 'idle'
    result.value = null
    error.value = null
    errorKind.value = null
  })

  it('renders the empty state', () => {
    const w = mount(App)
    expect(w.find('[data-testid="empty-state"]').exists()).toBe(true)
    expect(w.text()).toContain('Choose file')
    expect(w.text()).toContain('never leave your device')
  })

  it('parses a dropped file', async () => {
    const w = mount(App)
    const file = new File(['x'], 'a.dng')
    await w.find('[data-testid="app"]').trigger('drop', {
      dataTransfer: { files: [file], types: ['Files'] },
    })
    expect(parse).toHaveBeenCalledWith(file)
  })

  it('shows parsed structure while the render is still running', async () => {
    const w = mount(App)
    await w.find('[data-testid="app"]').trigger('drop', {
      dataTransfer: { files: [new File(['x'], 'a.dng')], types: ['Files'] },
    })
    expect(decode).toHaveBeenCalled()
    status.value = 'done'
    result.value = exampleResult
    await w.vm.$nextTick()
    expect(w.find('[data-testid="summary"]').exists()).toBe(true)
    expect(w.get('[data-testid="render-status"]').text()).toContain('Rendering')
  })

  it('parses a picked file', async () => {
    const w = mount(App)
    const file = new File(['x'], 'b.arw')
    const input = w.find<HTMLInputElement>('[data-testid="file-input"]')
    Object.defineProperty(input.element, 'files', { value: [file] })
    await input.trigger('change')
    expect(parse).toHaveBeenCalledWith(file)
    expect(metadataRead).toHaveBeenCalledWith(file)
  })

  it('shows the metadata status in the header', () => {
    result.value = exampleResult
    status.value = 'done'
    const w = mount(App)
    expect(w.find('[data-testid="metadata-status"]').text()).toBe(
      'Reading metadata…',
    )
  })

  it('shows the parsing state', () => {
    status.value = 'parsing'
    const w = mount(App)
    expect(w.find('[data-testid="parsing"]').exists()).toBe(true)
  })

  it('shows the error state', () => {
    status.value = 'error'
    error.value = 'boom'
    const w = mount(App)
    expect(w.find('[data-testid="error"]').text()).toContain('boom')
  })

  it('renders the summary from a ParseResult', async () => {
    const w = mount(App)
    await w.find('[data-testid="app"]').trigger('drop', {
      dataTransfer: { files: [new File(['x'], 'shot.dng')], types: [] },
    })
    status.value = 'done'
    result.value = exampleResult
    await w.vm.$nextTick()
    expect(w.find('[data-testid="summary-name"]').text()).toBe('shot.dng')
    expect(w.find('[data-testid="summary-format"]').text()).toBe(
      exampleResult.format?.name ?? 'Unknown',
    )
    expect(w.find('[data-testid="summary-warnings"]').text()).toBe(
      String(collectIssues(exampleResult).length),
    )
    expect(w.find('[data-testid="open-another"]').exists()).toBe(true)
  })

  it('shows a worker crash message', () => {
    status.value = 'error'
    errorKind.value = 'worker-crash'
    error.value = 'x'
    const w = mount(App)
    expect(w.find('[data-testid="problem-worker-crash"]').exists()).toBe(true)
  })

  it('shows a banner for unsupported files while keeping the layout', async () => {
    status.value = 'done'
    result.value = { ...exampleResult, format: null }
    const w = mount(App)
    expect(w.find('[data-testid="problem-unsupported"]').exists()).toBe(true)
    expect(w.find('[data-testid="summary"]').exists()).toBe(true)
  })

  it('opens the warnings panel from the header badge', async () => {
    status.value = 'done'
    result.value = exampleResult
    const w = mount(App)
    expect(w.find('[data-testid="warnings-panel"]').exists()).toBe(false)
    await w.find('[data-testid="summary-warnings"]').trigger('click')
    expect(w.find('[data-testid="warnings-panel"]').exists()).toBe(true)
  })
})
