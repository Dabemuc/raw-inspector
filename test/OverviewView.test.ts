import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it } from 'vitest'
import OverviewView from '../src/views/OverviewView.vue'
import { useInspection } from '../src/composables/useInspection'
import { createMemoryReader } from '../src/core/io'
import { parseFile } from '../src/parsers'
import { TiffBuilder } from './helpers/tiffBuilder'

describe('OverviewView show in file', () => {
  beforeEach(() => {
    useInspection().reset()
  })

  it('switches to technical mode and selects the tag entry', async () => {
    const b = new TiffBuilder()
    b.ifd().entry(0x10f, 'ASCII', 'Acme').entry(0x110, 'ASCII', 'X1')
    const result = await parseFile(createMemoryReader(b.build().bytes))
    const s = useInspection()
    s.setMode('overview')
    s.parser.result.value = result
    s.setParseResult(result)
    const w = mount(OverviewView)
    await w.vm.$nextTick()
    const button = w.get('[data-testid="show-in-file"]')
    await button.trigger('click')
    expect(s.mode.value).toBe('technical')
    const node = s.selectedNode.value
    expect(node?.kind).toBe('entry')
    expect(node?.details?.tagId).toBeTypeOf('number')
  })
})
