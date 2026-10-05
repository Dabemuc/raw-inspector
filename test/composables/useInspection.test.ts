import { ref, shallowRef } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { exampleResult } from '../../src/core/model/example'

const parse = vi.fn()
const parserCancel = vi.fn()
const decoderCancel = vi.fn()
const result = shallowRef<unknown>(null)

vi.mock('../../src/composables/useStructureParser', () => ({
  useStructureParser: () => ({
    parse,
    cancel: parserCancel,
    result,
    status: ref('idle'),
    error: ref(null),
    errorKind: ref(null),
  }),
}))
vi.mock('../../src/composables/useRawDecode', () => ({
  useRawDecode: () => ({ cancel: decoderCancel }),
}))

import {
  createInspection,
  modeFromHash,
} from '../../src/composables/useInspection'

const tick = () => new Promise((r) => setTimeout(r, 0))

describe('useInspection', () => {
  beforeEach(() => {
    window.location.hash = ''
    parse.mockClear()
    decoderCancel.mockClear()
    result.value = null
  })

  it('maps hashes to modes, defaulting to overview', () => {
    expect(modeFromHash('#technical')).toBe('technical')
    expect(modeFromHash('#overview')).toBe('overview')
    expect(modeFromHash('#nonsense')).toBe('overview')
    expect(modeFromHash('')).toBe('overview')
  })

  it('writes the mode to the hash', () => {
    const s = createInspection()
    s.setMode('technical')
    expect(window.location.hash).toBe('#technical')
    expect(s.mode.value).toBe('technical')
  })

  it('follows hash changes (back/forward)', async () => {
    const s = createInspection()
    window.location.hash = '#technical'
    await tick()
    expect(s.mode.value).toBe('technical')
    window.location.hash = '#bogus'
    await tick()
    expect(s.mode.value).toBe('overview')
  })

  it('keeps the selection when switching modes', async () => {
    const s = createInspection()
    result.value = exampleResult
    await tick()
    const id = Object.keys(exampleResult.nodes)[0]!
    s.selectNode(id)
    s.setMode('technical')
    s.setMode('overview')
    expect(s.selectedNodeId.value).toBe(id)
    expect(parse).not.toHaveBeenCalled()
  })

  it('resets the session and cancels the decoder on load', async () => {
    const s = createInspection()
    result.value = exampleResult
    await tick()
    s.selectNode(Object.keys(exampleResult.nodes)[0]!)
    const file = new File(['x'], 'a.dng')
    s.load(file)
    expect(decoderCancel).toHaveBeenCalled()
    expect(s.selectedNodeId.value).toBeNull()
    expect(s.file.value).toBe(file)
    expect(parse).toHaveBeenCalledWith(file)
  })
})
