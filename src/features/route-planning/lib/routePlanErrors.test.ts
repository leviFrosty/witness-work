import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/locales', () => ({
  default: {
    t: (key: string, options?: { count?: number }) =>
      options?.count === undefined ? key : `${key}:${options.count}`,
  },
}))

import { routePlanErrorMessage } from '@/features/route-planning/lib/routePlanErrors'

describe('routePlanErrorMessage', () => {
  it('tells timeout, offline, and a denied location apart', () => {
    expect(routePlanErrorMessage({ code: 'timeout' })).toBe(
      'routePlan_error_timeout'
    )
    expect(routePlanErrorMessage({ code: 'offline' })).toBe(
      'routePlan_error_offline'
    )
    expect(routePlanErrorMessage({ code: 'location_denied' })).toBe(
      'routePlan_error_locationDenied'
    )
  })

  it('says how long to wait when the server said', () => {
    expect(routePlanErrorMessage({ code: 'rate_limited' })).toBe(
      'routePlan_error_rateLimited'
    )
    expect(
      routePlanErrorMessage({ code: 'rate_limited', retryAfterMs: 12_300 })
    ).toBe('routePlan_error_rateLimitedSeconds:13')
    expect(
      routePlanErrorMessage({ code: 'rate_limited', retryAfterMs: 61_000 })
    ).toBe('routePlan_error_rateLimitedMinutes:2')
  })

  it('explains an account or device the server can’t serve', () => {
    expect(routePlanErrorMessage({ code: 'suspended' })).toBe(
      'routePlan_error_suspended'
    )
    expect(routePlanErrorMessage({ code: 'device_unverified' })).toBe(
      'routePlan_error_unverified'
    )
    expect(routePlanErrorMessage({ code: 'verify_later' })).toBe(
      'account_verifyLaterBody'
    )
  })
})
