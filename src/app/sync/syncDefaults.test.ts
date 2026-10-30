import { describe, expect, it } from 'vitest'
import {
  cloudSyncDefaultMayApply,
  platformSyncDefaultApplies,
} from '@/app/sync/syncDefaults'

const install = (
  installedBeforeFreeSync: boolean,
  isSupporter: boolean,
  entitlement: 'supporter' | 'everyone' | undefined = 'everyone',
  cloudSyncEntitled: boolean | null = null
) => ({ installedBeforeFreeSync, isSupporter, entitlement, cloudSyncEntitled })

describe('Cloud Sync’s default for a device that never chose (ADR 0040 §2)', () => {
  it('turns on for every new install while Cloud Sync is for everyone', () => {
    expect(cloudSyncDefaultMayApply(install(false, false))).toBe(true)
    expect(cloudSyncDefaultMayApply(install(false, true))).toBe(true)
  })

  it('waits for a new install the server wouldn’t sync yet', () => {
    expect(cloudSyncDefaultMayApply(install(false, false, 'supporter'))).toBe(
      false
    )
    expect(
      cloudSyncDefaultMayApply(install(false, false, 'supporter', true))
    ).toBe(true)
    expect(cloudSyncDefaultMayApply(install(false, true, 'supporter'))).toBe(
      true
    )
  })

  it('leaves an existing install that isn’t a Supporter off', () => {
    expect(cloudSyncDefaultMayApply(install(true, false))).toBe(false)
    // Entitled only because the server now syncs everyone.
    expect(
      cloudSyncDefaultMayApply(install(true, false, 'everyone', true))
    ).toBe(false)
    expect(cloudSyncDefaultMayApply(install(true, false, 'supporter'))).toBe(
      false
    )
  })

  it('keeps what an existing Supporter install got before', () => {
    expect(cloudSyncDefaultMayApply(install(true, true))).toBe(true)
    expect(cloudSyncDefaultMayApply(install(true, true, 'supporter'))).toBe(
      true
    )
    // The server confirmed a Supporter this device doesn't know about yet.
    expect(
      cloudSyncDefaultMayApply(install(true, false, 'supporter', true))
    ).toBe(true)
  })
})

describe('iCloud or Google Drive’s default while Cloud Sync isn’t offered', () => {
  it('turns on for every new install', () => {
    expect(platformSyncDefaultApplies(install(false, false))).toBe(true)
    expect(platformSyncDefaultApplies(install(false, true))).toBe(true)
  })

  it('keeps an existing install’s rule: Supporters only', () => {
    expect(platformSyncDefaultApplies(install(true, false))).toBe(false)
    expect(platformSyncDefaultApplies(install(true, true))).toBe(true)
  })
})
