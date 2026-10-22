import { beforeEach, describe, expect, it, vi } from 'vitest'

const runtime = vi.hoisted(() => ({ platform: 'ios' }))

vi.mock('react-native', () => ({
  Platform: {
    get OS() {
      return runtime.platform
    },
  },
}))
vi.mock('@/lib/dayPhrases', () => ({
  whenPhrase: (date: Date) => `when:${date.getTime()}`,
}))
vi.mock('@/lib/dates', () => ({ localizeDisplayDate: (text: string) => text }))
vi.mock('@/lib/locales', () => ({
  default: {
    t: (key: string, options?: Record<string, unknown>) =>
      options ? `${key} ${JSON.stringify(options)}` : key,
  },
}))

import {
  blockedCopy,
  blockedStatusCopy,
  errorCopy,
  formatResetTime,
  fullestWindow,
  limitNoticeCopy,
} from '@/features/scribe/components/scribeCopy'
import type { ScribeUsage } from '@/features/scribe/types'

const HOUR = 60 * 60 * 1000
const NOW = Date.UTC(2026, 9, 21, 12)

const usage = (percents: [string, number][]): ScribeUsage => ({
  plan: 'supporter',
  windows: percents.map(([id, percentUsed]) => ({
    id: id as 'session' | 'weekly' | 'monthly',
    percentUsed,
    resetsAt: NOW + HOUR,
  })),
  limited: false,
  resetsAt: null,
  supporterCheckFailed: false,
  asOf: NOW,
})

describe('Scribe AI copy', () => {
  beforeEach(() => {
    runtime.platform = 'ios'
  })

  it('names each blocked reason, with the store for this platform', () => {
    expect(blockedCopy('update_required')).toBe('scribe_blockedUpdate')
    expect(blockedCopy('device_ineligible')).toBe('scribe_blockedDevice')
    expect(blockedCopy('attestation_unavailable')).toBe(
      'scribe_blockedAttestation'
    )
    expect(blockedCopy('suspended')).toBe('scribe_blockedSuspended')

    runtime.platform = 'android'
    expect(blockedCopy('device_ineligible')).toBe('scribe_blockedDeviceAndroid')
  })

  it('gives Settings the account status for a blocked reason', () => {
    expect(blockedStatusCopy('update_required')).toBe('updateRequired_title')
    expect(blockedStatusCopy('device_ineligible')).toBe(
      'account_statusUnverified'
    )
    expect(blockedStatusCopy('attestation_unavailable')).toBe(
      'account_statusVerifyLater'
    )
    expect(blockedStatusCopy('suspended')).toBe('account_statusSuspended')
  })

  it('maps every error code to its message', () => {
    expect(errorCopy('network')).toBe('scribe_errorNetwork')
    expect(errorCopy('timeout')).toBe('scribe_errorNetwork')
    expect(errorCopy('rate_limited')).toBe('scribe_errorBusy')
    expect(errorCopy('unavailable')).toBe('scribe_errorUnavailable')
    expect(errorCopy('disabled')).toBe('scribe_errorUnavailable')
    expect(errorCopy('too_large')).toBe('scribe_errorTooLarge')
    expect(errorCopy('too_much')).toBe('scribe_errorTooMuch')
    expect(errorCopy('couldnt_finish')).toBe('scribe_errorCouldntFinish')
    expect(errorCopy('model_error')).toBe('scribe_errorGeneric')
    expect(errorCopy('unknown')).toBe('scribe_errorGeneric')
    expect(errorCopy('suspended')).toBe('scribe_blockedSuspended')
    expect(errorCopy('update_required')).toBe('scribe_blockedUpdate')
  })

  it('leaves the limit and a full conversation to their own cards', () => {
    expect(errorCopy('limit_reached')).toBeNull()
    expect(errorCopy('context_full')).toBeNull()
  })

  it('uses the Android device message on Android', () => {
    runtime.platform = 'android'
    expect(errorCopy('device_ineligible')).toBe('scribe_blockedDeviceAndroid')
  })

  it('picks the window closest to its limit', () => {
    expect(fullestWindow(null)).toBeNull()
    expect(fullestWindow(usage([]))).toBeNull()
    expect(
      fullestWindow(
        usage([
          ['session', 20],
          ['weekly', 64],
        ])
      )?.id
    ).toBe('weekly')
  })

  it('reads a near reset as a distance and a far one as a day and time', () => {
    expect(formatResetTime(NOW + 3 * HOUR, NOW)).toBe('in 3 hours')
    const far = NOW + 30 * HOUR
    expect(formatResetTime(far, NOW)).toBe(`when:${far}`)
  })

  it('says when a limit notice lifts, then that it has', () => {
    expect(limitNoticeCopy(NOW + 3 * HOUR, NOW)).toBe(
      'scribe_limitTitle. scribe_limitBody {"when":"in 3 hours"}'
    )
    expect(limitNoticeCopy(null, NOW)).toBe('scribe_limitTitle')
    expect(limitNoticeCopy(NOW - HOUR, NOW)).toBe('scribe_limitNoticeLifted')
  })
})
