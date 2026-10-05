import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import MetadataBrowser from '../src/components/MetadataBrowser.vue'
import { toCsv, toJson, exportFileName } from '../src/metadata/browse'
import type { MetadataResult } from '../src/metadata/types'

const long = 'x'.repeat(500)
const result: MetadataResult = {
  source: 'engine',
  engine: 'ExifTool 13.42',
  groups: [
    {
      id: 'Composite',
      family: 'Composite',
      name: 'Composite',
      tags: [{ name: 'Aperture', value: '2.8', raw: 2.8 }],
    },
    {
      id: 'EXIF:IFD0',
      family: 'EXIF',
      name: 'IFD0',
      tags: [
        { name: 'Make', value: 'Acme', raw: 'Acme', tagId: 0x10f },
        { name: 'Blob', description: 'Big blob', value: long },
      ],
    },
    {
      id: 'File',
      family: 'File',
      name: 'File',
      tags: [{ name: 'FileType', description: 'File Type', value: 'TIFF' }],
    },
    {
      id: 'EXIF:ExifIFD',
      family: 'EXIF',
      name: 'ExifIFD',
      tags: [
        { name: 'ExposureTime', value: '1/250, "fast"', raw: 0.004 },
        { name: 'ISO', value: '400', raw: [400, 800] },
      ],
    },
  ],
}

function mountIt(props: Record<string, unknown> = {}) {
  return mount(MetadataBrowser, {
    props: { result, status: 'ready', fileName: 'IMG_1.ARW', ...props },
  })
}
const names = (w: ReturnType<typeof mountIt>) =>
  w.findAll('[data-testid="group-header"]').map((h) => h.text())

describe('MetadataBrowser', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('orders groups by family with tag counts', () => {
    expect(names(mountIt())).toEqual([
      '▸ File1',
      '▾ IFD02',
      '▾ ExifIFD2',
      '▸ Composite1',
    ])
  })

  it('collapses and expands a group', async () => {
    const w = mountIt()
    expect(w.findAll('[data-testid="metadata-row"]')).toHaveLength(4)
    await w.findAll('[data-testid="group-header"]')[1]!.trigger('click')
    expect(w.findAll('[data-testid="metadata-row"]')).toHaveLength(2)
    await w.findAll('[data-testid="group-header"]')[0]!.trigger('click')
    expect(w.text()).toContain('File Type')
  })

  it('filters by name, description and value, expanding matches', async () => {
    const w = mountIt()
    await w.find('[data-testid="metadata-search"]').setValue('tiff')
    expect(names(w)).toEqual(['▾ File1'])
    expect(w.find('[data-testid="metadata-count"]').text()).toContain('1 match')
    await w.find('[data-testid="metadata-search"]').setValue('big blob')
    expect(names(w)).toEqual(['▾ IFD01'])
    await w.find('[data-testid="metadata-search"]').setValue('aperture')
    expect(names(w)).toEqual(['▾ Composite1'])
  })

  it('toggles raw values and tag ids', async () => {
    const w = mountIt()
    expect(w.text()).toContain('1/250')
    await w.find('[data-testid="toggle-raw"]').setValue(true)
    expect(w.text()).toContain('0.004')
    expect(w.text()).toContain('400 800')
    expect(w.find('[data-testid="tag-ids"]').exists()).toBe(false)
    await w.find('[data-testid="toggle-ids"]').setValue(true)
    expect(w.text()).toContain('Make (0x10f)')
  })

  it('copies a value on click', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { clipboard: { writeText } })
    const w = mountIt()
    await w.findAll('[data-testid="metadata-value"]')[0]!.trigger('click')
    expect(writeText).toHaveBeenCalledWith('Acme')
  })

  it('truncates long values until show more', async () => {
    const w = mountIt()
    const cell = () => w.findAll('[data-testid="metadata-value"]')[1]!.text()
    expect(cell().length).toBeLessThan(300)
    await w.find('[data-testid="show-more"]').trigger('click')
    expect(cell()).toBe(long)
  })

  it('exports JSON and CSV named after the file', async () => {
    const create = vi.fn(() => 'blob:x')
    URL.createObjectURL = create
    URL.revokeObjectURL = vi.fn()
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => {})
    const w = mountIt()
    await w.find('[data-testid="export-csv"]').trigger('click')
    await w.find('[data-testid="export-json"]').trigger('click')
    expect(create).toHaveBeenCalledTimes(2)
    expect(click).toHaveBeenCalledTimes(2)
    expect(exportFileName('IMG_1.ARW', 'csv')).toBe('IMG_1.metadata.csv')
  })

  it('builds CSV and JSON content', () => {
    const lines = toCsv(result).trim().split('\n')
    expect(lines[0]).toBe('group,name,value,raw')
    expect(lines).toContain('IFD0,Make,Acme,Acme')
    expect(lines).toContain('ExifIFD,ExposureTime,"1/250, ""fast""",0.004')
    expect(lines).toContain('ExifIFD,ISO,400,400 800')
    expect(JSON.parse(toJson(result))).toEqual(result)
  })

  it('switches the source label', async () => {
    const w = mountIt({
      result: { source: 'parser', groups: result.groups },
      status: 'loading',
    })
    const label = () => w.find('[data-testid="metadata-source"]').text()
    expect(label()).toBe('from file structure (engine still running)')
    expect(w.find('[data-testid="metadata-reading"]').exists()).toBe(true)
    await w.setProps({ result, status: 'ready' })
    expect(label()).toBe('from ExifTool 13.42')
    expect(w.find('[data-testid="metadata-reading"]').exists()).toBe(false)
  })

  it('shows a reading state without a result', () => {
    const w = mountIt({ result: null, status: 'loading' })
    expect(w.find('[data-testid="metadata-empty"]').text()).toBe(
      'Reading metadata…',
    )
  })
})

describe('MetadataBrowser show in file', () => {
  it('offers the action only for tags with a node and emits its id', async () => {
    const tagIndex = {
      byId: new Map([['IFD0:271', 'n7']]),
      byName: new Map<string, string>(),
    }
    const w = mountIt({ tagIndex })
    const rows = w.findAll('[data-testid="metadata-row"]')
    const buttons = w.findAll('[data-testid="show-in-file"]')
    expect(rows.length).toBeGreaterThan(buttons.length)
    expect(buttons).toHaveLength(1)
    await buttons[0]!.trigger('click')
    expect(w.emitted('show-in-file')).toEqual([['n7']])
  })

  it('has no action without an index', () => {
    expect(mountIt().find('[data-testid="show-in-file"]').exists()).toBe(false)
  })
})
