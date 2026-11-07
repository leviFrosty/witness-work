import { describe, expect, it } from 'vitest'
import {
  replayAllowed,
  replayOptInRequired,
  type ReplayGateInput,
} from '@/lib/sessionReplay/replayGate'

const open: ReplayGateInput = {
  sampled: true,
  analyticsAllowed: true,
  production: true,
  dataProtectionMode: false,
  country: 'US',
  optedIn: false,
}

describe('replayOptInRequired', () => {
  it.each(['DE', 'FR', 'GB', 'CH', 'ie', 'IS'])('asks in %s', (country) => {
    expect(replayOptInRequired(country)).toBe(true)
  })

  it.each(['US', 'CA', 'BR', 'AU'])('does not ask in %s', (country) => {
    expect(replayOptInRequired(country)).toBe(false)
  })

  it('asks when the country is unknown or still being read', () => {
    expect(replayOptInRequired(null)).toBe(true)
    expect(replayOptInRequired(undefined)).toBe(true)
    expect(replayOptInRequired('')).toBe(true)
  })
})

describe('replayAllowed', () => {
  it('records a sampled session outside the opt-in regions', () => {
    expect(replayAllowed(open)).toBe(true)
  })

  it('samples one session in ten', () => {
    expect(replayAllowed({ ...open, sampled: false })).toBe(false)
  })

  it('follows the analytics setting', () => {
    expect(replayAllowed({ ...open, analyticsAllowed: false })).toBe(false)
  })

  it('does not record a build that does not ingest usage', () => {
    expect(replayAllowed({ ...open, production: false })).toBe(false)
  })

  it('never records in Data Protection Mode, even after an opt-in', () => {
    expect(replayAllowed({ ...open, dataProtectionMode: true })).toBe(false)
    expect(
      replayAllowed({ ...open, dataProtectionMode: true, optedIn: true })
    ).toBe(false)
  })

  it.each(['CH', 'DE', 'GB'])(
    'records a visitor in %s only after they opt in',
    (country) => {
      expect(replayAllowed({ ...open, country })).toBe(false)
      expect(replayAllowed({ ...open, country, optedIn: true })).toBe(true)
    }
  )

  it('treats an unknown country as opt-in-required', () => {
    expect(replayAllowed({ ...open, country: null })).toBe(false)
    expect(replayAllowed({ ...open, country: undefined })).toBe(false)
    expect(replayAllowed({ ...open, country: null, optedIn: true })).toBe(true)
  })

  it('does not let an opt-in override the analytics setting or the sample', () => {
    const optedIn = { ...open, country: 'DE', optedIn: true }
    expect(replayAllowed({ ...optedIn, analyticsAllowed: false })).toBe(false)
    expect(replayAllowed({ ...optedIn, sampled: false })).toBe(false)
  })

  it('does not need an opt-in outside the regions, and ignores one', () => {
    expect(replayAllowed({ ...open, optedIn: true })).toBe(true)
  })
})
