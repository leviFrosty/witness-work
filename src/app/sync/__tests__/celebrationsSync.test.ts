vi.mock('expo-constants', () => ({
  default: { expoConfig: { version: '1.0.0' } },
}))
vi.mock('expo-device', () => ({
  getDeviceTypeAsync: async () => 1,
  osName: 'iOS',
  deviceType: 1,
  DeviceType: { TABLET: 2 },
}))
import { beforeEach, describe, expect, it, vi } from 'vitest'
vi.mock('@/stores/mmkv', () => import('@/__tests__/mocks/mmkv'))
vi.mock('@/lib/logger', () => import('@/__tests__/mocks/logger'))
vi.mock('@/lib/errorTracking', () => ({
  errorTracking: { captureException: vi.fn() },
}))
vi.mock('expo-crypto', () => ({ randomUUID: () => 'new' }))
vi.mock('react-native', () => ({ Alert: { alert: vi.fn() } }))
vi.mock('expo-document-picker', () => ({}))
vi.mock('expo-file-system/legacy', () => ({}))
vi.mock('@/lib/locales', () => ({ default: { t: (key: string) => key } }))
import { mergePreferences } from '@/app/sync/preferencesMerge'
import { dropUnreadableSettings } from '@/app/sync/payloadValidation'
import { restoreBackupFile } from '@/app/sync/backupFileRestore'
import { createBackupFile } from '@/lib/backupFile'
import {
  NON_SYNCABLE_PREFERENCE_KEYS,
  syncableValues,
} from '@/lib/syncPreferencePolicy'
import { PREFERENCE_DEFAULTS, usePreferences } from '@/stores/preferences'

const merge = (
  local: Record<string, unknown>,
  localTs: Record<string, number>,
  remote: Record<string, unknown>,
  remoteTs: Record<string, number>
) =>
  mergePreferences(
    local,
    localTs,
    remote,
    remoteTs,
    NON_SYNCABLE_PREFERENCE_KEYS
  )

beforeEach(() => {
  usePreferences.setState({
    celebratedTiers: {},
    celebratedMilestones: {},
    homeChecklistAllDoneCelebrated: false,
    homeChecklistCompletedAt: null,
    preferenceUpdatedAt: {},
  })
})

describe('celebrations follow the account', () => {
  it('sends shown celebrations with the synced preferences', () => {
    usePreferences.getState().markTierCelebrated('2026-10', 'reached')
    usePreferences.getState().markMilestoneCelebrated('2026', 600)
    usePreferences.getState().set({
      homeChecklistAllDoneCelebrated: true,
      homeChecklistCompletedAt: 1,
    })
    const synced = syncableValues(usePreferences.getState())
    expect(synced).toMatchObject({
      celebratedTiers: { '2026-10': ['reached'] },
      celebratedMilestones: { '2026': [600] },
      homeChecklistAllDoneCelebrated: true,
    })

    expect(synced).not.toHaveProperty('homeChecklistCompletedAt')
    expect(usePreferences.getState().preferenceUpdatedAt).toMatchObject({
      celebratedTiers: expect.any(Number),
      celebratedMilestones: expect.any(Number),
      homeChecklistAllDoneCelebrated: expect.any(Number),
    })
  })

  it('gives a new device the celebrations another device already showed', () => {
    const merged = merge(
      {
        celebratedTiers: {},
        celebratedMilestones: {},
        homeChecklistAllDoneCelebrated: false,
      },
      {},
      {
        celebratedTiers: { '2026-09': ['reached', 'exceeded'] },
        celebratedMilestones: { '2025': [300, 600] },
        homeChecklistAllDoneCelebrated: true,
      },
      {
        celebratedTiers: 100,
        celebratedMilestones: 100,
        homeChecklistAllDoneCelebrated: 100,
      }
    )
    expect(merged.values).toMatchObject({
      celebratedTiers: { '2026-09': ['reached', 'exceeded'] },
      celebratedMilestones: { '2025': [300, 600] },
      homeChecklistAllDoneCelebrated: true,
    })
  })

  it('keeps every celebration either device showed, whichever wrote last', () => {
    const merged = merge(
      {
        celebratedTiers: { '2026-09': ['reached'], '2026-10': ['reached'] },
        celebratedMilestones: { '2025': [300] },
        homeChecklistAllDoneCelebrated: true,
      },
      {
        celebratedTiers: 100,
        celebratedMilestones: 100,
        homeChecklistAllDoneCelebrated: 100,
      },
      {
        celebratedTiers: { '2026-09': ['exceeded'], '2026-08': ['crushed'] },
        celebratedMilestones: { '2025': [600], '2024': [600] },
        homeChecklistAllDoneCelebrated: false,
      },
      {
        celebratedTiers: 200,
        celebratedMilestones: 200,
        homeChecklistAllDoneCelebrated: 200,
      }
    )
    expect(merged.values).toMatchObject({
      celebratedTiers: {
        '2026-08': ['crushed'],
        '2026-09': ['reached', 'exceeded'],
        '2026-10': ['reached'],
      },
      celebratedMilestones: { '2024': [600], '2025': [300, 600] },
      homeChecklistAllDoneCelebrated: true,
    })
    expect(merged.updatedAt).toMatchObject({
      celebratedTiers: 200,
      celebratedMilestones: 200,
      homeChecklistAllDoneCelebrated: 200,
    })
  })

  it("doesn't change anything when the other device saw nothing new", () => {
    const local = {
      celebratedTiers: { '2026-10': ['exceeded', 'reached'] },
      celebratedMilestones: { '2025': [600, 300] },
      homeChecklistAllDoneCelebrated: true,
    }
    const stamps = {
      celebratedTiers: 300,
      celebratedMilestones: 300,
      homeChecklistAllDoneCelebrated: 300,
    }
    const merged = merge(
      local,
      stamps,
      {
        celebratedTiers: { '2026-10': ['reached'] },
        celebratedMilestones: { '2025': [300, 600] },
        homeChecklistAllDoneCelebrated: true,
      },
      {
        celebratedTiers: 200,
        celebratedMilestones: 200,
        homeChecklistAllDoneCelebrated: 200,
      }
    )
    expect(merged.changed).toBe(false)
    expect(merged.values).toEqual(local)
  })

  it('drops a malformed celebration record from another build', () => {
    const store = {
      values: {
        celebratedTiers: { '2026-10': [1] },
        celebratedMilestones: { '2025': ['600'] },
        homeChecklistAllDoneCelebrated: 'yes',
      } as Record<string, unknown>,
      updatedAt: {
        celebratedTiers: 1,
        celebratedMilestones: 1,
        homeChecklistAllDoneCelebrated: 1,
      } as Record<string, number>,
    }
    expect(dropUnreadableSettings(store, PREFERENCE_DEFAULTS).sort()).toEqual([
      'celebratedMilestones',
      'celebratedTiers',
      'homeChecklistAllDoneCelebrated',
    ])
    expect(store.values).toEqual({})
    expect(store.updatedAt).toEqual({})
  })

  it('restores a backup without replaying or forgetting celebrations', () => {
    usePreferences.getState().markTierCelebrated('2026-09', 'reached')
    usePreferences.getState().markMilestoneCelebrated('2025', 300)
    usePreferences.getState().set({ homeChecklistAllDoneCelebrated: true })
    const backup = JSON.parse(JSON.stringify(createBackupFile()))
    expect(backup.preferencesStore).toMatchObject({
      celebratedTiers: { '2026-09': ['reached'] },
      homeChecklistAllDoneCelebrated: true,
    })

    usePreferences.setState({
      celebratedTiers: { '2026-10': ['reached'] },
      celebratedMilestones: { '2025': [600] },
      homeChecklistAllDoneCelebrated: false,
    })
    restoreBackupFile(backup)
    expect(usePreferences.getState()).toMatchObject({
      celebratedTiers: { '2026-09': ['reached'], '2026-10': ['reached'] },
      celebratedMilestones: { '2025': [600, 300] },
      homeChecklistAllDoneCelebrated: true,
    })
  })
})
