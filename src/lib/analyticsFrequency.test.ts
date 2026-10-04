import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const storage = vi.hoisted(() => ({
  values: new Map<string, string>(),
  fails: false,
}))
vi.mock('react-native-mmkv', () => ({
  MMKV: class {
    getString(key: string) {
      if (storage.fails) throw new Error('native storage unavailable')
      return storage.values.get(key)
    }
    set(key: string, value: string) {
      if (storage.fails) throw new Error('native storage unavailable')
      storage.values.set(key, value)
    }
    delete(key: string) {
      storage.values.delete(key)
    }
  },
}))

beforeEach(() => {
  vi.resetModules()
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-10-04T12:00:00Z'))
  storage.values.clear()
  storage.fails = false
})
afterEach(() => vi.useRealTimers())

describe('analytics frequency', () => {
  it('keeps daily reach across launches, then allows the next UTC day', async () => {
    let { allowAnalyticsFrequency: allow } = await import(
      './analyticsFrequency'
    )
    expect(allow('Application Became Active')).toBe(true)
    expect(allow('Application Became Active')).toBe(false)
    vi.resetModules()
    ;({ allowAnalyticsFrequency: allow } = await import('./analyticsFrequency'))
    expect(allow('Application Became Active')).toBe(false)
    vi.setSystemTime(new Date('2026-10-05T00:00:00Z'))
    expect(allow('Application Became Active')).toBe(true)
  })

  it('keeps the first nudge variant on each surface, without counting rerenders', async () => {
    const { allowAnalyticsFrequency: allow } = await import(
      './analyticsFrequency'
    )
    expect(
      allow('supporter_nudge_viewed', { source: 'home', variant: 'gentle' })
    ).toBe(true)
    expect(
      allow('supporter_nudge_viewed', {
        source: 'home',
        variant: 'gentle',
        has_time: true,
      })
    ).toBe(false)
    expect(
      allow('supporter_nudge_viewed', { source: 'home', variant: 'direct' })
    ).toBe(true)
    expect(
      allow('supporter_nudge_viewed', { source: 'progress', variant: 'gentle' })
    ).toBe(true)
  })

  it('counts timer adoption once per session, while keeping failures', async () => {
    const { allowAnalyticsFrequency: allow } = await import(
      './analyticsFrequency'
    )
    expect(
      allow('timer_action_completed', { action: 'started', $session_id: 'one' })
    ).toBe(true)
    expect(
      allow('timer_action_completed', { action: 'started', $session_id: 'one' })
    ).toBe(false)
    expect(
      allow('timer_action_failed', { action: 'started', $session_id: 'one' })
    ).toBe(true)
    expect(
      allow('timer_action_completed', { action: 'started', $session_id: 'two' })
    ).toBe(true)
  })

  it('keeps distinct registration outcomes in the same session', async () => {
    const { allowAnalyticsFrequency: allow } = await import(
      './analyticsFrequency'
    )
    expect(
      allow('buddies_push_registration', {
        outcome: 'failed',
        reason: 'offline',
        $session_id: 'one',
      })
    ).toBe(true)
    expect(
      allow('buddies_push_registration', {
        outcome: 'failed',
        reason: 'offline',
        $session_id: 'one',
      })
    ).toBe(false)
    expect(
      allow('buddies_push_registration', {
        outcome: 'registered',
        $session_id: 'one',
      })
    ).toBe(true)
  })

  it('keeps every Supporter gate visit, purchase outcome, and core action', async () => {
    const { allowAnalyticsFrequency: allow } = await import(
      './analyticsFrequency'
    )
    for (let i = 0; i < 3; i++) {
      expect(
        allow('supporter_feature_gate_viewed', { gate_flow_id: `visit-${i}` })
      ).toBe(true)
      expect(allow('supporter_purchase_completed')).toBe(true)
      expect(allow('time_entry_created')).toBe(true)
    }
  })

  it('falls back to memory when native storage fails', async () => {
    storage.fails = true
    const { allowAnalyticsFrequency: allow } = await import(
      './analyticsFrequency'
    )
    expect(allow('onboarding_checklist_viewed')).toBe(true)
    expect(allow('onboarding_checklist_viewed')).toBe(false)
  })

  it('ignores corrupt frequency data and clears caps with the anonymous identity', async () => {
    storage.values.set('daily', '{invalid')
    const { allowAnalyticsFrequency: allow, resetAnalyticsFrequency } =
      await import('./analyticsFrequency')
    expect(allow('backup_reminder_viewed')).toBe(true)
    expect(allow('backup_reminder_viewed')).toBe(false)
    resetAnalyticsFrequency()
    expect(allow('backup_reminder_viewed')).toBe(true)
  })
})

it('caps flag exposure across launches without merging flags or variants', async () => {
  let { allowAnalyticsFrequency: allow } = await import('./analyticsFrequency')
  expect(
    allow('$feature_flag_called', {
      $feature_flag: 'notes-import',
      $feature_flag_response: true,
    })
  ).toBe(true)
  expect(
    allow('$feature_flag_called', {
      $feature_flag: 'buddies',
      $feature_flag_response: true,
    })
  ).toBe(true)
  expect(
    allow('$feature_flag_called', {
      $feature_flag: 'notes-import',
      $feature_flag_response: false,
    })
  ).toBe(true)
  expect(
    allow('$feature_flag_called', {
      $feature_flag: 'notes-import',
      $feature_flag_response: 'variant-b',
    })
  ).toBe(true)
  vi.resetModules()
  ;({ allowAnalyticsFrequency: allow } = await import('./analyticsFrequency'))
  expect(
    allow('$feature_flag_called', {
      $feature_flag: 'notes-import',
      $feature_flag_response: true,
    })
  ).toBe(false)
  vi.setSystemTime(new Date('2026-10-05T00:00:00Z'))
  expect(
    allow('$feature_flag_called', {
      $feature_flag: 'notes-import',
      $feature_flag_response: true,
    })
  ).toBe(true)
})
