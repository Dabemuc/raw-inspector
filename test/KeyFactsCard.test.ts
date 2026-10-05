import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import KeyFactsCard from '../src/components/KeyFactsCard.vue'

describe('KeyFactsCard', () => {
  it('shows a skeleton while loading with nothing yet', () => {
    const w = mount(KeyFactsCard, { props: { facts: [], loading: true } })
    expect(w.find('[data-testid="key-facts-skeleton"]').exists()).toBe(true)
  })

  it('shows values and a plain map link', () => {
    const href = 'https://www.openstreetmap.org/?mlat=1&mlon=2'
    const w = mount(KeyFactsCard, {
      props: {
        loading: false,
        facts: [
          { id: 'camera', group: 'Camera', label: 'Camera', value: 'Acme X1' },
          {
            id: 'gps',
            group: 'GPS',
            label: 'Position',
            value: '1° N, 2° E',
            href,
            linkLabel: 'Open map',
          },
        ],
      },
    })
    expect(w.find('[data-testid="key-facts-skeleton"]').exists()).toBe(false)
    expect(w.get('[data-testid="fact-camera"]').text()).toBe('Acme X1')
    const a = w.get('a')
    expect(a.attributes('href')).toBe(href)
    expect(a.attributes('rel')).toContain('noopener')
    expect(w.find('img, iframe').exists()).toBe(false)
  })
})

describe('KeyFactsCard show in file', () => {
  const tag = { name: 'Model', value: 'X1' }
  const facts = [
    {
      id: 'camera',
      group: 'Camera' as const,
      label: 'Camera',
      value: 'X1',
      source: { group: 'IFD0', tag },
    },
    { id: 'format', group: 'File' as const, label: 'Format', value: 'DNG' },
  ]

  it('links matched facts only and emits the node id', async () => {
    const tagIndex = {
      byId: new Map<string, string>(),
      byName: new Map([['IFD0:Model', 'n3']]),
    }
    const w = mount(KeyFactsCard, {
      props: { facts, loading: false, tagIndex },
    })
    expect(w.findAll('button')).toHaveLength(1)
    await w.get('[data-testid="show-in-file-camera"]').trigger('click')
    expect(w.emitted('show-in-file')).toEqual([['n3']])
  })

  it('shows no action without a match', () => {
    const w = mount(KeyFactsCard, { props: { facts, loading: false } })
    expect(w.find('button').exists()).toBe(false)
  })
})
