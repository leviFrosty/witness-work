import { buildPayload, parsePayload } from '@/app/sync/payload'
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
vi.mock('@/lib/locales', () => ({ default: { t: (key: string) => key } }))
import { createBackupFile, restoreBackupFile } from '@/lib/backupFile'
import { mergePreferences } from '@/app/sync/preferencesMerge'
import { NON_SYNCABLE_PREFERENCE_KEYS } from '@/lib/syncPreferencePolicy'
import { usePreferences } from '@/stores/preferences'
import type { SavedContactView } from '@/types/savedContactView'

const view = (name: string, order = 0): SavedContactView => ({
  name,
  order,
  createdAt: 1,
  filters: [{ kind: 'hasStudy' }],
  sort: 'recentConversation',
  direction: 'desc',
})

beforeEach(() => {
  usePreferences.setState({
    savedContactViews: {},
    activeSavedContactView: null,
    preferenceUpdatedAt: {},
  })
})

describe('Saved View sync stamps', () => {
  it('stamps only the views that changed', () => {
    const { set } = usePreferences.getState()
    set({ savedContactViews: { a: view('A'), b: view('B', 1) } })
    const first = usePreferences.getState().preferenceUpdatedAt
    expect(first['savedContactViews:a']).toBeGreaterThan(0)
    expect(first['savedContactViews:b']).toBeGreaterThan(0)

    set({ savedContactViews: { a: view('Renamed'), b: view('B', 1) } })
    const second = usePreferences.getState().preferenceUpdatedAt
    expect(second['savedContactViews:a']).toBeGreaterThan(
      first['savedContactViews:a']
    )
    expect(second['savedContactViews:b']).toBe(first['savedContactViews:b'])
  })

  it('never stamps the device-local active view', () => {
    usePreferences.getState().set({ activeSavedContactView: { id: 'a' } })
    expect(
      usePreferences.getState().preferenceUpdatedAt.activeSavedContactView
    ).toBeUndefined()
  })
})

describe('Saved View merge', () => {
  it('keeps views created on different devices', () => {
    const merged = mergePreferences(
      { savedContactViews: { a: view('A') } },
      { savedContactViews: 100, 'savedContactViews:a': 100 },
      { savedContactViews: { b: view('B') } },
      { savedContactViews: 200, 'savedContactViews:b': 200 },
      NON_SYNCABLE_PREFERENCE_KEYS
    )
    expect(merged.values.savedContactViews).toEqual({
      a: view('A'),
      b: view('B'),
    })
  })

  it('applies the newer rename and deletion per view', () => {
    const merged = mergePreferences(
      { savedContactViews: { a: view('A'), b: view('B'), c: view('C') } },
      {
        savedContactViews: 100,
        'savedContactViews:a': 100,
        'savedContactViews:b': 300,
        'savedContactViews:c': 100,
      },
      { savedContactViews: { a: view('Renamed'), b: view('Stale') } },
      {
        savedContactViews: 200,
        'savedContactViews:a': 200,
        'savedContactViews:b': 200,
        // `c` was deleted on the peer after this device last changed it.
        'savedContactViews:c': 200,
      },
      NON_SYNCABLE_PREFERENCE_KEYS
    )
    expect(merged.values.savedContactViews).toEqual({
      a: view('Renamed'),
      b: view('B'),
    })
  })

  it('ignores an incoming active view', () => {
    const merged = mergePreferences(
      { activeSavedContactView: null },
      {},
      { activeSavedContactView: { id: 'peer' } },
      { activeSavedContactView: 999 },
      NON_SYNCABLE_PREFERENCE_KEYS
    )
    expect(merged.values.activeSavedContactView).toBeNull()
  })
})

describe('Saved View payloads and backups', () => {
  it('round-trips views through iCloud payloads without the active view', () => {
    usePreferences.getState().set({
      savedContactViews: { a: view('A') },
      activeSavedContactView: { id: 'a' },
    })
    const parsed = parsePayload(JSON.stringify(buildPayload({ deviceId: 't' })))
    expect(parsed?.preferencesStore.values.savedContactViews).toEqual({
      a: view('A'),
    })
    expect(
      parsed?.preferencesStore.values.activeSavedContactView
    ).toBeUndefined()
  })

  it('skips a view it can’t read and leaves the local copy alone', () => {
    const payload = buildPayload({ deviceId: 't' })
    payload.preferencesStore.values.savedContactViews = {
      a: view('A'),
      b: { ...view('B'), filters: [{ kind: 'fromALaterVersion' }] },
    }
    payload.preferencesStore.updatedAt = {
      ...payload.preferencesStore.updatedAt,
      savedContactViews: 300,
      'savedContactViews:a': 300,
      'savedContactViews:b': 300,
    }
    const parsed = parsePayload(JSON.stringify(payload))
    expect(parsed?.preferencesStore.values.savedContactViews).toEqual({
      a: view('A'),
    })
    expect(
      parsed?.preferencesStore.updatedAt['savedContactViews:b']
    ).toBeUndefined()

    const merged = mergePreferences(
      { savedContactViews: { b: view('Local B') } },
      { savedContactViews: 100, 'savedContactViews:b': 100 },
      parsed!.preferencesStore.values,
      parsed!.preferencesStore.updatedAt,
      NON_SYNCABLE_PREFERENCE_KEYS
    )
    expect(merged.values.savedContactViews).toEqual({
      a: view('A'),
      b: view('Local B'),
    })
  })

  it('rejects views that aren’t a map', () => {
    const payload = buildPayload({ deviceId: 't' })
    payload.preferencesStore.values.savedContactViews = ['A']
    expect(parsePayload(JSON.stringify(payload))).toBeNull()
  })

  it('restores views from a JSON backup and keeps the local active view', () => {
    usePreferences.getState().set({ savedContactViews: { a: view('A') } })
    const backup = JSON.parse(JSON.stringify(createBackupFile()))
    expect(backup.preferencesStore.savedContactViews).toEqual({ a: view('A') })
    expect(backup.preferencesStore.activeSavedContactView).toBeUndefined()

    usePreferences.setState({
      savedContactViews: {},
      activeSavedContactView: { id: 'local' },
    })
    restoreBackupFile(backup)
    expect(usePreferences.getState().savedContactViews).toEqual({
      a: view('A'),
    })
    expect(usePreferences.getState().activeSavedContactView).toEqual({
      id: 'local',
    })
  })
})
