import { describe, expect, it } from 'vitest'
import {
  FRESH_SETUP_PREFERENCES,
  freshSetupPreferences,
} from '@/lib/syncPreferencePolicy'

const neverChose = {
  installedBeforeFreeSync: false,
  iCloudSyncEnabled: false,
  iCloudSyncSetByUser: false,
  syncProvider: null,
}

describe('skipping the restore in onboarding', () => {
  // ADR 0040 §2: a new install gets Cloud Sync after onboarding; not
  // restoring a backup isn't a choice to keep sync off.
  it('leaves a new install’s sync to its default', () => {
    const prefs = freshSetupPreferences(neverChose)
    expect(prefs).toEqual({
      iCloudFreshSetup: true,
      iCloudSyncEnabled: false,
      iCloudSyncNeedsResolution: false,
    })
    expect(prefs).not.toHaveProperty('iCloudSyncSetByUser')
  })

  it('keeps sync off after Restart onboarding on a device that synced', () => {
    expect(
      freshSetupPreferences({ ...neverChose, iCloudSyncEnabled: true })
    ).toEqual(FRESH_SETUP_PREFERENCES)
    expect(
      freshSetupPreferences({ ...neverChose, iCloudSyncSetByUser: true })
    ).toEqual(FRESH_SETUP_PREFERENCES)
    expect(
      freshSetupPreferences({ ...neverChose, syncProvider: 'cloud' })
    ).toEqual(FRESH_SETUP_PREFERENCES)
  })

  it('records the choice on an install from before sync was free, as before', () => {
    expect(
      freshSetupPreferences({ ...neverChose, installedBeforeFreeSync: true })
    ).toEqual(FRESH_SETUP_PREFERENCES)
  })
})
