import { describe, expect, it } from 'vitest'
import {
  buddiesAvailability,
  settledBuddiesFlag,
  type BuddiesAvailabilityInput,
} from '@/features/buddies/lib/availability'

const input = (
  fields: Partial<BuddiesAvailabilityInput> = {}
): BuddiesAvailabilityInput => ({
  nativeAvailable: true,
  devOverride: false,
  flag: undefined,
  flagStatus: 'loading',
  flagLastKnown: null,
  flagConfirmed: false,
  relayDisabled: false,
  ...fields,
})

describe('buddiesAvailability', () => {
  it('hides Buddies on a binary without the Keychain module', () => {
    expect(
      buddiesAvailability(
        input({ nativeAvailable: false, flag: true, flagStatus: 'loaded' })
      )
    ).toBe('hidden')
    expect(
      buddiesAvailability(input({ nativeAvailable: false, devOverride: true }))
    ).toBe('hidden')
  })

  it('follows a loaded flag', () => {
    expect(
      buddiesAvailability(input({ flag: true, flagStatus: 'loaded' }))
    ).toBe('enabled')
    expect(
      buddiesAvailability(
        input({ flag: false, flagStatus: 'loaded', flagLastKnown: true })
      )
    ).toBe('hidden')
    // Multivariate values never open a boolean gate.
    expect(
      buddiesAvailability(input({ flag: 'variant', flagStatus: 'loaded' }))
    ).toBe('hidden')
  })

  it('treats a load that worked without the flag as off', () => {
    expect(
      buddiesAvailability(input({ flagStatus: 'loaded', flagLastKnown: true }))
    ).toBe('hidden')
  })

  it('shows the dev override as the flag being on', () => {
    expect(buddiesAvailability(input({ devOverride: true }))).toBe('enabled')
    expect(
      buddiesAvailability(
        input({ devOverride: true, flag: false, flagStatus: 'loaded' })
      )
    ).toBe('enabled')
  })

  it.each(['loading', 'idle', 'offline', 'failed'] as const)(
    'never shows Buddies to someone it was never on for (%s)',
    (flagStatus) => {
      expect(buddiesAvailability(input({ flagStatus }))).toBe('hidden')
      expect(
        buddiesAvailability(input({ flagStatus, flagLastKnown: false }))
      ).toBe('hidden')
    }
  )

  it('loads while a remembered flag is confirmed for the first time', () => {
    expect(
      buddiesAvailability(input({ flagStatus: 'loading', flagLastKnown: true }))
    ).toBe('loading')
  })

  it('stays enabled while flags reload after being confirmed this session', () => {
    expect(
      buddiesAvailability(
        input({
          flagStatus: 'loading',
          flagLastKnown: true,
          flagConfirmed: true,
        })
      )
    ).toBe('enabled')
  })

  it.each(['idle', 'offline', 'failed'] as const)(
    'stays enabled with a remembered flag when flags settle without a value (%s)',
    (flagStatus) => {
      expect(
        buddiesAvailability(input({ flagStatus, flagLastKnown: true }))
      ).toBe('enabled')
    }
  )

  it('dims Buddies while the kill switch is on, wherever it would show', () => {
    expect(
      buddiesAvailability(
        input({ flag: true, flagStatus: 'loaded', relayDisabled: true })
      )
    ).toBe('disabled')
    expect(
      buddiesAvailability(
        input({
          flagStatus: 'loading',
          flagLastKnown: true,
          relayDisabled: true,
        })
      )
    ).toBe('disabled')
    expect(
      buddiesAvailability(
        input({ flag: false, flagStatus: 'loaded', relayDisabled: true })
      )
    ).toBe('hidden')
  })
})

describe('settledBuddiesFlag', () => {
  it('remembers a loaded value, and a loaded absence as off', () => {
    expect(settledBuddiesFlag(true, 'loaded')).toBe(true)
    expect(settledBuddiesFlag(false, 'loaded')).toBe(false)
    expect(settledBuddiesFlag('variant', 'loaded')).toBe(false)
    expect(settledBuddiesFlag(undefined, 'loaded')).toBe(false)
  })

  it.each(['loading', 'idle', 'offline', 'failed'] as const)(
    'keeps what it remembers when flags are %s',
    (status) => {
      expect(settledBuddiesFlag(undefined, status)).toBeUndefined()
    }
  )
})
