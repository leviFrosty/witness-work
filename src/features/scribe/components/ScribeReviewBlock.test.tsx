import React from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type {
  ScribeProposal,
  ScribeProposalController,
  ScribeProposalStatus,
  ScribeReviewCard,
} from '@/features/scribe/types'

const runtime = vi.hoisted(() => ({
  controller: null as unknown as ScribeProposalController,
  undo: vi.fn(),
}))

const navigate = vi.hoisted(() => vi.fn())
const textSize = vi.hoisted(() => ({ accessibility: false }))
vi.mock('react-native', () => ({ View: 'View' }))
vi.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate }),
}))
vi.mock('lucide-react-native', () => ({
  Mic: 'Mic',
  NotebookText: 'NotebookText',
  TriangleAlert: 'TriangleAlert',
}))
vi.mock('@/components/ui/Button', () => ({ default: 'Button' }))
vi.mock('@/components/ui/MyText', () => ({ default: 'Text' }))
vi.mock('@/components/ui/LucideIcon', () => ({ default: () => null }))
vi.mock('@/contexts/theme', () => ({
  default: () => ({
    colors: new Proxy({}, { get: () => '#000' }),
    fonts: new Proxy({}, { get: () => 'Font' }),
    fontSize: () => 14,
  }),
}))
vi.mock('@/lib/locales', () => ({
  default: {
    t: (key: string, params?: Record<string, unknown>) =>
      params ? `${key} ${JSON.stringify(params)}` : key,
  },
}))
vi.mock('@/hooks/useAccessibilityTextSize', () => ({
  default: () => textSize.accessibility,
}))
vi.mock('@/features/scribe', () => ({
  useScribeProposal: () => runtime.controller,
  undoScribeProposal: runtime.undo,
}))
vi.mock('@/features/scribe/components/ScribeReviewCard', () => ({
  default: 'ScribeReviewCard',
}))

import ScribeReviewBlock from '@/features/scribe/components/ScribeReviewBlock'

const card = (
  id: string,
  status: ScribeReviewCard['status'],
  target: ScribeReviewCard['target'] = null
) => ({ id, status, target }) as ScribeReviewCard

const setProposal = (
  status: ScribeProposalStatus,
  overrides: Partial<ScribeProposal> = {},
  counts = { selected: 2, ready: 2, needsChoice: 0, needsConsent: 0 },
  canUndo = status === 'applied' || status === 'partially_applied'
) => {
  runtime.controller = {
    proposal: {
      id: 'p1',
      conversationId: 'c1',
      createdAt: 0,
      status,
      cards: [card('a', 'pending'), card('b', 'pending')],
      invalidCount: 0,
      tainted: false,
      undoKept: 0,
      ...overrides,
    },
    counts,
    canAdd: counts.needsChoice === 0 && counts.needsConsent === 0,
    canUndo,
    toggleCard: vi.fn(),
    chooseContact: vi.fn(),
    setConsent: vi.fn(),
    add: vi.fn(),
    dismiss: vi.fn(),
  }
}

const render = ({ canMessage = true } = {}) => {
  const onSayAChange = vi.fn()
  let renderer!: ReactTestRenderer
  act(() => {
    renderer = create(
      <ScribeReviewBlock
        proposalId='p1'
        onSayAChange={canMessage ? onSayAChange : undefined}
      />
    )
  })
  const root = renderer.root
  const texts = () =>
    root
      .findAllByType('Text' as never)
      .flatMap((node) => node.children)
      .filter((child): child is string => typeof child === 'string')
  const cards = () => root.findAllByType('ScribeReviewCard' as never)
  const buttons = () => root.findAllByType('Button' as never)
  return { root, texts, cards, buttons, onSayAChange }
}

describe('ScribeReviewBlock', () => {
  beforeEach(() => {
    runtime.undo.mockClear()
    textSize.accessibility = false
  })

  it.each<[ScribeProposalStatus, string]>([
    ['dismissed', 'scribe_notAdded'],
    ['superseded', 'scribe_replaced'],
    ['undone', 'scribe_undone'],
  ])('collapses a %s proposal to one line', (status, line) => {
    setProposal(status)
    const { texts, cards, buttons } = render()
    expect(texts()).toEqual(['scribe_reviewTitle', line])
    expect(cards()).toHaveLength(0)
    expect(buttons()).toHaveLength(0)
  })

  it('counts what is ready and what needs a choice', () => {
    setProposal(
      'pending',
      {},
      { selected: 3, ready: 2, needsChoice: 1, needsConsent: 0 }
    )
    const { texts, cards } = render()
    expect(texts()).toContain(
      'scribe_reviewReady {"count":2} · scribe_reviewNeedsChoice {"count":1}'
    )
    expect(cards().map((c) => c.props.editable)).toEqual([true, true])
  })

  it('counts what needs a householder’s agreement', () => {
    setProposal(
      'pending',
      {},
      { selected: 2, ready: 1, needsChoice: 0, needsConsent: 1 }
    )
    expect(render().texts()).toContain(
      'scribe_reviewReady {"count":1} · scribe_reviewNeedsConsent {"count":1}'
    )
  })

  it('leaves out the needs-choice count when nothing needs one', () => {
    setProposal('pending')
    expect(render().texts()).toContain('scribe_reviewReady {"count":2}')
  })

  it('offers Say a change while pending', () => {
    setProposal('pending')
    const { buttons, onSayAChange } = render()
    expect(buttons()).toHaveLength(1)
    act(() => buttons()[0].props.onPress())
    expect(onSayAChange).toHaveBeenCalledTimes(1)
  })

  it.each([
    [false, 'row'],
    [true, undefined],
  ])(
    'puts Say a change beside the title, or under it at accessibility sizes (%s)',
    (accessibility, direction) => {
      textSize.accessibility = accessibility
      setProposal('pending')
      const { root, buttons } = render()
      const headingRow = buttons()[0].parent!
      expect(root.findAllByType('View' as never)).toContain(headingRow)
      expect(headingRow.props.style.flexDirection).toBe(direction)
    }
  )

  it('leaves out Say a change while no message can go out (a limit)', () => {
    setProposal('pending')
    const { buttons, cards } = render({ canMessage: false })
    expect(buttons()).toHaveLength(0)
    expect(cards().map((c) => c.props.editable)).toEqual([true, true])
  })

  it('locks the cards while adding', () => {
    setProposal('applying')
    const { buttons, cards } = render()
    expect(buttons()[0].props.disabled).toBe(true)
    expect(cards().map((c) => c.props.editable)).toEqual([false, false])
  })

  it('shows what was added, with Undo', () => {
    setProposal('applied', {
      cards: [card('a', 'applied'), card('b', 'applied')],
    })
    const { texts, buttons } = render()
    expect(texts()).toContain('scribe_added {"count":2}')
    expect(texts()).toContain('scribe_undo')
    act(() => buttons()[0].props.onPress())
    expect(runtime.undo).toHaveBeenCalledWith('p1', 'conversation')
  })

  it('drops Undo once the undo window has passed', () => {
    setProposal(
      'applied',
      { cards: [card('a', 'applied'), card('b', 'applied')] },
      undefined,
      false
    )
    const { texts, buttons } = render()
    expect(texts()).toContain('scribe_added {"count":2}')
    expect(texts()).not.toContain('scribe_undo')
    expect(buttons()).toHaveLength(0)
  })

  it('says what an Undo left in place', () => {
    setProposal('undone', { undoKept: 1 })
    expect(render().texts()).toEqual([
      'scribe_reviewTitle',
      'scribe_undone',
      'scribe_undoKept {"count":1}',
    ])
  })

  it('says why Undo kept everything', () => {
    setProposal(
      'applied',
      { cards: [card('a', 'applied')], undoKept: 2 },
      undefined,
      false
    )
    const { texts, buttons } = render()
    expect(texts()).toContain('scribe_undoKept {"count":2}')
    expect(buttons()).toHaveLength(0)
  })

  it('opens the Contact or Plan an added card wrote', () => {
    setProposal('applied', {
      cards: [
        card('a', 'applied', {
          type: 'contact',
          contactId: 'ana',
          visitId: 'v1',
        }),
        card('b', 'applied', { type: 'plan', planId: 'plan-1' }),
        card('c', 'applied'),
      ],
    })
    const { cards } = render()
    expect(cards()[2].props.onOpen).toBeUndefined()
    act(() => cards()[0].props.onOpen())
    expect(navigate).toHaveBeenLastCalledWith('Contact Details', {
      id: 'ana',
      highlightedVisitId: 'v1',
    })
    act(() => cards()[1].props.onOpen())
    expect(navigate).toHaveBeenLastCalledWith('Plan Details', {
      dayPlanId: 'plan-1',
    })
  })

  it('says nothing was added when every card changed since', () => {
    setProposal(
      'partially_applied',
      { cards: [card('a', 'skipped'), card('b', 'skipped')] },
      undefined,
      false
    )
    const { texts, buttons } = render()
    expect(texts()).toContain('scribe_notAdded')
    expect(texts()).toContain('scribe_applySkipped {"count":2}')
    expect(buttons()).toHaveLength(0)
  })

  it('counts a partly added card as added', () => {
    setProposal('partially_applied', {
      cards: [card('a', 'partial'), card('b', 'applied')],
    })
    expect(render().texts()).toContain('scribe_added {"count":2}')
  })

  it('says how many were skipped when only some were added', () => {
    setProposal('partially_applied', {
      cards: [card('a', 'applied'), card('b', 'skipped')],
    })
    const { texts } = render()
    expect(texts()).toContain('scribe_added {"count":1}')
    expect(texts()).toContain('scribe_applySkipped {"count":1}')
  })

  it('notes invalid writes, text from notes, and a failed add', () => {
    setProposal('failed', { invalidCount: 2, tainted: true })
    const { texts } = render()
    expect(texts()).toEqual(
      expect.arrayContaining([
        'scribe_reviewInvalid {"count":2}',
        'scribe_reviewFromNotes',
        'scribe_applyFailed',
      ])
    )
  })
})
