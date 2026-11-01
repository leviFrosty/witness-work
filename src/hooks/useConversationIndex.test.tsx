import React from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ foreground: new Set<() => void>() }))

vi.mock('@/lib/appLifecycle', () => ({
  addForegroundListener: (listener: () => void) => {
    mocks.foreground.add(listener)
    return { remove: () => mocks.foreground.delete(listener) }
  },
}))

import useConversationIndex from '@/hooks/useConversationIndex'
import type { ConversationIndex } from '@/lib/conversationIndex'
import { DEFAULT_STALENESS_BREAKPOINTS } from '@/constants/staleness'
import { MISSED_FOLLOW_UP_AFTER_HOURS } from '@/lib/conversations'
import { Visit } from '@/types/visit'

const HOUR_MS = 60 * 60 * 1000
const START = new Date('2026-06-12T09:00:00').getTime()
const DUE = START + HOUR_MS

const conversations: Visit[] = [
  {
    id: 'c1',
    contact: { id: 'soon' },
    date: new Date(START - 3 * 24 * HOUR_MS),
    isBibleStudy: false,
    followUp: { date: new Date(DUE), notifyMe: true },
  },
]

describe('useConversationIndex', () => {
  let renderer: ReactTestRenderer | undefined
  const renders: ConversationIndex[] = []
  const latest = () => renders[renders.length - 1]

  function Probe() {
    renders.push(
      useConversationIndex(conversations, DEFAULT_STALENESS_BREAKPOINTS)
    )
    return null
  }

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    vi.useFakeTimers()
    vi.setSystemTime(START)
    mocks.foreground.clear()
    renders.length = 0
    act(() => {
      renderer = create(<Probe />)
    })
  })
  afterEach(() => {
    act(() => renderer?.unmount())
    vi.useRealTimers()
  })

  it('moves a Follow-up to missed once due + 4h passes, with no new Visit', () => {
    expect(latest().nextFollowUpMs.get('soon')).toBe(DUE)
    expect(latest().missedFollowUpMs.has('soon')).toBe(false)

    act(() => {
      vi.advanceTimersByTime(
        DUE + MISSED_FOLLOW_UP_AFTER_HOURS * HOUR_MS - START - 1
      )
    })
    expect(latest().missedFollowUpMs.has('soon')).toBe(false)

    act(() => {
      vi.advanceTimersByTime(2000)
    })
    expect(latest().nextFollowUpMs.has('soon')).toBe(false)
    expect(latest().missedFollowUpMs.has('soon')).toBe(true)
  })

  it('catches up when the app comes back after the threshold', () => {
    vi.setSystemTime(DUE + MISSED_FOLLOW_UP_AFTER_HOURS * HOUR_MS + HOUR_MS)
    expect(latest().missedFollowUpMs.has('soon')).toBe(false)

    act(() => mocks.foreground.forEach((listener) => listener()))
    expect(latest().missedFollowUpMs.has('soon')).toBe(true)
  })
})
