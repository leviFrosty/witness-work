import { beforeEach, describe, expect, it, vi } from 'vitest'

const runtime = vi.hoisted(() => ({ capture: vi.fn(), set: vi.fn() }))
vi.mock('@/lib/analytics', () => ({ analytics: { capture: runtime.capture } }))
vi.mock('@/stores/preferences', () => ({
  usePreferences: { getState: () => ({ set: runtime.set }) },
}))

import { setHoursLogging, shouldAskAboutHoursLogging } from '@/lib/hoursLogging'

describe('shouldAskAboutHoursLogging', () => {
  it('asks a Kingdom Publisher who has not answered', () => {
    expect(
      shouldAskAboutHoursLogging({
        role: 'publisher',
        logsHours: false,
        hoursLoggingAsked: false,
      })
    ).toBe(true)
  })

  it('stops asking once answered or already logging', () => {
    expect(
      shouldAskAboutHoursLogging({
        role: 'publisher',
        logsHours: false,
        hoursLoggingAsked: true,
      })
    ).toBe(false)
    expect(
      shouldAskAboutHoursLogging({
        role: 'publisher',
        logsHours: true,
        hoursLoggingAsked: false,
      })
    ).toBe(false)
  })

  it('never asks an hours-mode role', () => {
    expect(
      shouldAskAboutHoursLogging({
        role: 'regularAuxiliary',
        logsHours: false,
        hoursLoggingAsked: false,
      })
    ).toBe(false)
  })
})

describe('setHoursLogging', () => {
  beforeEach(() => {
    runtime.capture.mockClear()
    runtime.set.mockClear()
  })

  it('saves the answer, marks it asked, and records where', () => {
    setHoursLogging(true, 'tray')
    expect(runtime.set).toHaveBeenCalledWith({
      logsHours: true,
      hoursLoggingAsked: true,
    })
    expect(runtime.capture).toHaveBeenCalledWith('hours_logging_changed', {
      enabled: true,
      source: 'tray',
    })
  })

  it('marks a no as asked too', () => {
    setHoursLogging(false, 'onboarding')
    expect(runtime.set).toHaveBeenCalledWith({
      logsHours: false,
      hoursLoggingAsked: true,
    })
  })
})
