import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it } from 'vitest'
import FileProblem from '../../src/components/FileProblem.vue'
import WarningsPanel from '../../src/components/WarningsPanel.vue'
import { useSelection } from '../../src/composables/useSelection'
import { collectIssues, fileProblem } from '../../src/core/model'
import { exampleResult } from '../../src/core/model/example'

describe('FileProblem', () => {
  const cases = [
    ['empty', 'is empty'],
    ['too-small', 'too small'],
    ['unsupported', 'Unsupported format'],
    ['read-error', 'Could not read'],
    ['worker-crash', 'crashed'],
  ] as const
  for (const [problem, text] of cases) {
    it(`renders ${problem}`, () => {
      const w = mount(FileProblem, { props: { problem } })
      expect(w.find(`[data-testid="problem-${problem}"]`).text()).toContain(
        text,
      )
    })
  }

  it('names the detected format and mentions available views', () => {
    const w = mount(FileProblem, {
      props: {
        problem: 'unsupported',
        formatName: 'Canon CR3',
        hasResult: true,
      },
    })
    expect(w.text()).toContain('Canon CR3')
    expect(w.find('[data-testid="problem-shown"]').exists()).toBe(true)
  })

  it('emits open', async () => {
    const w = mount(FileProblem, { props: { problem: 'empty' } })
    await w.find('[data-testid="problem-open"]').trigger('click')
    expect(w.emitted('open')).toHaveLength(1)
  })
})

describe('fileProblem', () => {
  it('classifies by size and format', () => {
    expect(fileProblem({ ...exampleResult, fileSize: 0 })).toBe('empty')
    expect(fileProblem({ ...exampleResult, fileSize: 4 })).toBe('too-small')
    expect(fileProblem({ ...exampleResult, format: null })).toBe('unsupported')
    expect(fileProblem(exampleResult)).toBeNull()
  })
})

describe('WarningsPanel', () => {
  const sel = useSelection()
  beforeEach(() => sel.setParseResult(exampleResult))

  it('lists every issue once, grouped by severity', () => {
    const w = mount(WarningsPanel, { props: { result: exampleResult } })
    expect(w.findAll('[data-testid="warning-item"]')).toHaveLength(
      collectIssues(exampleResult).length,
    )
    expect(collectIssues(exampleResult).length).toBeGreaterThan(0)
  })

  it('selects the node when an item is clicked', async () => {
    const issue = collectIssues(exampleResult).find((i) => i.nodeId)!
    const w = mount(WarningsPanel, { props: { result: exampleResult } })
    const item = w
      .findAll('[data-testid="warning-item"]')
      .find((i) => i.text().includes(issue.message))!
    await item.trigger('click')
    expect(sel.selectedNodeId.value).toBe(issue.nodeId)
  })

  it('shows an empty message', () => {
    const w = mount(WarningsPanel, {
      props: { result: { ...exampleResult, warnings: [], nodes: {} } },
    })
    expect(w.find('[data-testid="warnings-empty"]').exists()).toBe(true)
  })
})
