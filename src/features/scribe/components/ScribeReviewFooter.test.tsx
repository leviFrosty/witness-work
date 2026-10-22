import React from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type {
  ScribeApplyResult,
  ScribeProposalController,
  ScribeProposalStatus,
} from '@/features/scribe/types'

const runtime = vi.hoisted(() => ({
  controller: null as unknown as ScribeProposalController,
  undo: vi.fn(),
  toast: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
}))

vi.mock('react-native', () => ({
  View: 'View',
  useWindowDimensions: () => ({ fontScale: 1 }),
}))
vi.mock('@/components/ui/Button', () => ({ default: 'Button' }))
vi.mock('@/components/ui/MyText', () => ({ default: 'Text' }))
vi.mock('@/contexts/theme', () => ({
  default: () => ({
    colors: new Proxy({}, { get: () => '#000' }),
    fonts: new Proxy({}, { get: () => 'Font' }),
    fontSize: () => 14,
  }),
}))
vi.mock('@/lib/haptics', () => ({
  default: { success: runtime.success, error: runtime.error },
}))
vi.mock('@/lib/locales', () => ({
  default: {
    t: (key: string, params?: Record<string, unknown>) =>
      params ? `${key} ${JSON.stringify(params)}` : key,
  },
}))
vi.mock('@/stores/undoToast', () => ({ showUndoToast: runtime.toast }))
vi.mock('@/features/scribe', () => ({
  useScribeProposal: () => runtime.controller,
  undoScribeProposal: runtime.undo,
}))

import ScribeReviewFooter from '@/features/scribe/components/ScribeReviewFooter'

const setProposal = (
  status: ScribeProposalStatus,
  counts = { selected: 3, ready: 3, needsChoice: 0 },
  result: ScribeApplyResult = {
    status: 'applied',
    appliedCards: 3,
    skippedCards: 0,
  }
) => {
  runtime.controller = {
    proposal: {
      id: 'p1',
      conversationId: 'c1',
      createdAt: 0,
      status,
      cards: [],
      invalidCount: 0,
      tainted: false,
      undoKept: 0,
    },
    counts,
    canAdd: status === 'pending' && counts.selected > 0 && !counts.needsChoice,
    canUndo: false,
    toggleCard: vi.fn(),
    chooseContact: vi.fn(),
    add: vi.fn(async () => result),
    dismiss: vi.fn(),
  }
}

const render = () => {
  let renderer!: ReactTestRenderer
  act(() => {
    renderer = create(<ScribeReviewFooter proposalId='p1' />)
  })
  const texts = () =>
    renderer.root
      .findAllByType('Text' as never)
      .flatMap((node) => node.children)
      .filter((child): child is string => typeof child === 'string')
  const add = () => renderer.root.findByType('Button' as never)
  return { renderer, texts, add }
}

describe('ScribeReviewFooter', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows Add with the selected count and the disclaimer', () => {
    setProposal('pending')
    const { texts, add } = render()
    expect(texts()).toEqual(['scribe_add {"count":3}', 'scribe_disclaimer'])
    expect(add().props.disabled).toBe(false)
  })

  it('blocks Add until every person is picked', () => {
    setProposal('pending', { selected: 3, ready: 2, needsChoice: 1 })
    const { texts, add } = render()
    expect(texts()[0]).toBe('scribe_addBlocked')
    expect(add().props.disabled).toBe(true)
  })

  it('shows progress while adding', () => {
    setProposal('applying')
    const { add } = render()
    expect(add().props.loading).toBe(true)
    expect(add().props.disabled).toBe(true)
  })

  it.each<ScribeProposalStatus>(['applied', 'dismissed', 'superseded'])(
    'goes away once the proposal is %s',
    (status) => {
      setProposal(status)
      expect(render().renderer.toJSON()).toBeNull()
    }
  )

  it('adds, then offers Undo in a toast', async () => {
    setProposal('pending')
    const { add } = render()
    await act(async () => add().props.onPress())
    expect(runtime.controller.add).toHaveBeenCalledTimes(1)
    expect(runtime.success).toHaveBeenCalledTimes(1)
    expect(runtime.toast).toHaveBeenCalledWith({
      message: 'scribe_added {"count":3}',
      onUndo: expect.any(Function),
    })
    runtime.toast.mock.calls[0][0].onUndo()
    expect(runtime.undo).toHaveBeenCalledWith('p1', 'toast')
  })

  it('shows no toast when everything changed since', async () => {
    setProposal('pending', undefined, {
      status: 'partially_applied',
      appliedCards: 0,
      skippedCards: 3,
    })
    const { add } = render()
    await act(async () => add().props.onPress())
    expect(runtime.success).not.toHaveBeenCalled()
    expect(runtime.error).toHaveBeenCalledTimes(1)
    expect(runtime.toast).not.toHaveBeenCalled()
  })

  it('buzzes and shows no toast when adding fails', async () => {
    setProposal('pending', undefined, {
      status: 'failed',
      appliedCards: 0,
      skippedCards: 0,
    })
    const { add } = render()
    await act(async () => add().props.onPress())
    expect(runtime.error).toHaveBeenCalledTimes(1)
    expect(runtime.toast).not.toHaveBeenCalled()
  })
})
