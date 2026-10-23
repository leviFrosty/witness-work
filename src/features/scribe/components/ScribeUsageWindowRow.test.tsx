import React from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('react-native', () => ({
  Platform: { OS: 'ios' },
  View: 'View',
}))
vi.mock('@/components/ui/MyText', () => ({ default: 'Text' }))
vi.mock('@/contexts/theme', () => ({
  default: () => ({
    colors: {
      accent: 'accent',
      warn: 'warn',
      error: 'error',
      textAlt: 'textAlt',
      backgroundLighter: 'bg',
      border: 'border',
    },
    fonts: { semiBold: 'SemiBold' },
    fontSize: () => 14,
  }),
}))
vi.mock('@/lib/locales', () => ({
  default: {
    t: (key: string, params?: Record<string, unknown>) =>
      params ? `${key} ${JSON.stringify(params)}` : key,
  },
}))
vi.mock('@/lib/dayPhrases', () => ({
  whenPhrase: () => 'Friday at 9:00 AM',
}))
vi.mock('@/lib/dates', () => ({ localizeDisplayDate: (text: string) => text }))

import ScribeUsageWindowRow, {
  usageResetLine,
} from '@/features/scribe/components/ScribeUsageWindowRow'
import type { ScribeUsageWindow } from '@/features/scribe/types'

const HOUR = 60 * 60 * 1000
const NOW = Date.UTC(2026, 9, 21, 12)

const render = (window: ScribeUsageWindow) => {
  let renderer!: ReactTestRenderer
  act(() => {
    renderer = create(<ScribeUsageWindowRow window={window} />)
  })
  const root = renderer.root
  const texts = root
    .findAllByType('Text' as never)
    .flatMap((node) => node.children)
  const bar = root
    .findAllByType('View' as never)
    .find((node) => node.props.style?.height === '100%')!
  return { root, texts, bar }
}

describe('Scribe AI usage windows', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('says when a window resets, or that it has not started', () => {
    expect(
      usageResetLine({ id: 'session', percentUsed: 0, resetsAt: null }, NOW)
    ).toBe('scribe_usageNotStarted')
    expect(
      usageResetLine(
        { id: 'session', percentUsed: 30, resetsAt: NOW + 3 * HOUR },
        NOW
      )
    ).toBe('scribe_usageResets {"when":"in 3 hours"}')
    expect(
      usageResetLine(
        { id: 'weekly', percentUsed: 30, resetsAt: NOW + 72 * HOUR },
        NOW
      )
    ).toBe('scribe_usageResets {"when":"Friday at 9:00 AM"}')
  })

  it('shows the window, its percent, a bar and the reset', () => {
    const { root, texts, bar } = render({
      id: 'weekly',
      percentUsed: 64,
      resetsAt: NOW + 3 * HOUR,
    })
    expect(texts).toEqual([
      'scribe_usageWindow_weekly',
      'scribe_usagePercent {"percent":64}',
      'scribe_usageResets {"when":"in 3 hours"}',
    ])
    expect(bar.props.style).toMatchObject({
      width: '64%',
      backgroundColor: 'accent',
    })
    expect(
      root.find((node) => node.props.accessible === true).props
        .accessibilityLabel
    ).toBe(
      'scribe_usageWindow_weekly, scribe_usagePercent {"percent":64}, scribe_usageResets {"when":"in 3 hours"}'
    )
  })

  it('warns near the limit and caps the bar at full', () => {
    expect(
      render({ id: 'monthly', percentUsed: 85, resetsAt: NOW + HOUR }).bar.props
        .style.backgroundColor
    ).toBe('warn')
    const full = render({ id: 'monthly', percentUsed: 130, resetsAt: NOW })
    expect(full.bar.props.style).toMatchObject({
      width: '100%',
      backgroundColor: 'error',
    })
    expect(full.texts).toContain('scribe_usagePercent {"percent":100}')
  })

  it('reads an unstarted window as not used yet', () => {
    expect(
      render({ id: 'session', percentUsed: 0, resetsAt: null }).texts
    ).toContain('scribe_usageNotStarted')
  })
})
