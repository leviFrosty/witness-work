import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('react-native', () => ({
  Platform: { OS: 'ios' },
  Alert: { alert: vi.fn() },
  AppState: {
    currentState: 'active',
    addEventListener: () => ({ remove: () => {} }),
  },
}))
vi.mock('../../../../modules/icloud-bridge', () => ({}))
vi.mock('@/lib/account', () => ({
  reclaimAccountFile: vi.fn(),
  clearAdoptedAccountId: vi.fn(),
}))
vi.mock('@/lib/analytics', () => ({ analytics: { capture: vi.fn() } }))
vi.mock('@/lib/errorTracking', () => ({
  errorTracking: {
    captureException: vi.fn(),
    captureMessage: vi.fn(),
    addBreadcrumb: vi.fn(),
  },
}))
vi.mock('@/lib/logger', () => import('@/__tests__/mocks/logger'))
vi.mock('@/stores/mmkv', () => import('@/__tests__/mocks/mmkv'))
vi.mock(
  '@react-native-async-storage/async-storage',
  () => import('@/__tests__/mocks/asyncStorage')
)
vi.mock('expo-crypto', () => ({ randomUUID: () => 'generated' }))
vi.mock('expo-image-manipulator', () => ({
  manipulateAsync: vi.fn(),
  SaveFormat: { JPEG: 'jpeg' },
}))
vi.mock('expo-constants', () => ({
  default: { expoConfig: { version: '1.0.0' } },
}))
vi.mock('expo-device', () => ({
  getDeviceTypeAsync: async () => 1,
  osName: 'iOS',
  deviceType: 1,
  DeviceType: { TABLET: 2 },
}))
vi.mock('expo-document-picker', () => ({}))
vi.mock('@/lib/installId', () => ({
  getOrCreateInstallId: () => 'install',
  androidDeviceInstallId: () => 'install',
}))
const deleted = vi.hoisted(() => [] as string[])
vi.mock('expo-file-system/legacy', () => ({
  documentDirectory: 'file:///test/Documents/',
  getInfoAsync: vi.fn(async () => ({ exists: false })),
  deleteAsync: vi.fn(async (uri: string) => {
    deleted.push(uri)
  }),
}))
vi.mock('@/lib/locales', () => ({ default: { t: (key: string) => key } }))
vi.mock('@/app/sync/premadeFuels', () => ({
  addPremadeFuels: () => {},
}))

import { restoreBackupFile } from '@/app/sync/backupFileRestore'
import { backupFileContents } from '@/app/sync/backupFileContents'
import {
  applyMergedState,
  localMergeState,
  mergePayloadsInto,
} from '@/app/sync/mergeIntoLocal'
import {
  buildPayload,
  parsePayload,
  type SyncPayload,
} from '@/app/sync/payload'
import { replaceLocalWithRemote } from '@/app/sync/iCloudSync'
import { hasTerritoryData } from '@/app/sync/territoryStoreSync'
import { isMarked } from '@/features/territories/lib/personalSync'
import { emptySpace } from '@/features/territories/lib/shared/space'
import { useTerritories } from '@/features/territories/stores/territories'
import type { Territory } from '@/features/territories/types/territory'
import { usePreferences } from '@/stores/preferences'

const uuid = (n: number) =>
  `9d8c7b6a-5f4e-4d3c-8b2a-${String(n).padStart(12, '0')}`
const OAK = uuid(100)
const T0 = Date.UTC(2026, 10, 2, 15)

const card = (patch: Partial<Territory> = {}): Territory => ({
  id: uuid(1),
  number: '12',
  name: 'North Hill',
  photo: 'card-1.jpg',
  checkedOutAt: T0,
  createdAt: T0,
  streets: [
    {
      id: OAK,
      name: 'Oak Street',
      numbering: 'both',
      next: 4,
      doors: [
        { id: uuid(2), label: '1', outcome: 'notHome', at: T0, tries: 1 },
        { id: uuid(3), label: '3', outcome: 'doNotCall', at: T0, tries: 1 },
      ],
    },
  ],
  doNotCalls: [{ id: uuid(4), address: '9 Elm Street', at: T0 }],
  ...patch,
})

const ownSpace = (createdAt: number) =>
  emptySpace('space-1', {
    territoryId: uuid(1),
    myMemberId: 'me',
    ownerId: 'me',
    members: [
      {
        memberId: 'me',
        dhPub: '',
        joinedAt: createdAt,
        scopes: null,
        invitedBy: null,
      },
    ],
    records: {
      h: {
        kind: 'territory',
        data: {
          id: uuid(1),
          number: '12',
          checkedOutAt: T0,
          createdAt: T0,
          houseRecords: true,
        },
        stamp: createdAt,
        deleted: false,
      },
    },
  })

const fresh = () =>
  useTerritories.setState(useTerritories.getInitialState(), true)

const sync = (payload: SyncPayload) => {
  const { changed, merged } = mergePayloadsInto(localMergeState(), [payload])
  if (changed) applyMergedState(merged)
  return changed
}

const payloadFromHere = () => {
  const json = JSON.stringify(buildPayload({ deviceId: 'device-a' }))
  return parsePayload(json)!
}

const personal = () =>
  useTerritories.getState().territories.filter((t) => !t.shared)

beforeEach(() => {
  fresh()
  deleted.length = 0
  usePreferences.setState({ territoryPrivacyMode: false })
})

describe('territories in the sync payload', () => {
  it('stamps every edit and carries territories to another device', () => {
    useTerritories.getState().save(card())
    expect(Object.keys(useTerritories.getState().ledger)).toEqual([uuid(1)])
    const payload = payloadFromHere()
    expect(payload.territoryStore?.territoryRecords.length).toBe(5)
    expect(JSON.stringify(payload)).not.toContain('card-1.jpg')

    fresh()
    expect(sync(payload)).toBe(true)
    const [copy] = personal()
    expect(copy.number).toBe('12')
    expect(copy.photo).toBeUndefined()
    expect(copy.streets[0].doors.map((d) => d.label)).toEqual(['1', '3'])
    expect(copy.doNotCalls).toEqual([card().doNotCalls[0]])
    expect(copy.streets[0].next).toBe(2)
    expect(sync(payload)).toBe(false)
  })

  it('applies a delete from the other device', async () => {
    useTerritories.getState().save(card())
    const before = payloadFromHere()
    useTerritories.getState().remove(uuid(1))
    const after = payloadFromHere()
    fresh()
    sync(before)
    useTerritories.setState((state) => ({
      territories: state.territories.map((t) => ({ ...t, photo: 'here.jpg' })),
    }))
    sync(after)
    expect(personal()).toEqual([])
    await vi.waitFor(() =>
      expect(deleted).toEqual([
        'file:///test/Documents/territory-cards/here.jpg',
      ])
    )
    sync(before)
    expect(personal()).toEqual([])
  })

  it('keeps territories when an older version leaves the slice out', () => {
    useTerritories.getState().save(card())
    const { territoryStore: _left, ...older } = payloadFromHere()
    expect(sync(older as SyncPayload)).toBe(false)
    expect(personal()).toHaveLength(1)
    replaceLocalWithRemote(older as SyncPayload)
    expect(personal()).toHaveLength(1)
  })

  it('reads a payload whose territory records are partly unreadable', () => {
    useTerritories.getState().save(card())
    const payload = buildPayload({ deviceId: 'device-a' })
    const records = payload.territoryStore!.territoryRecords as unknown[]
    records.push({ id: 'not/valid', kind: 'door', data: {}, updatedAt: 1 })
    records.push({ id: `${uuid(1)}:d.${uuid(9)}`, kind: 'doNotCall' })
    const dropped: string[] = []
    const parsed = parsePayload(JSON.stringify(payload), (fields) =>
      dropped.push(...fields)
    )
    expect(parsed?.territoryStore?.territoryRecords).toHaveLength(5)
    expect(dropped.length).toBeGreaterThan(0)
  })

  it('replaces this device’s territories on a restore that has them', () => {
    useTerritories.getState().save(card())
    const payload = payloadFromHere()
    fresh()
    useTerritories.getState().save(card({ id: uuid(50), number: '99' }))
    replaceLocalWithRemote(payload)
    expect(personal().map((t) => t.number)).toEqual(['12'])
  })

  it('counts as data on this device', () => {
    expect(hasTerritoryData()).toBe(false)
    useTerritories.getState().save(card())
    expect(hasTerritoryData()).toBe(true)
  })

  it('leaves a territory shared from another device to its space', () => {
    useTerritories.getState().save(card())
    const payload = payloadFromHere()
    fresh()
    useTerritories.getState().saveSpace(ownSpace(T0 + 1))
    sync(payload)
    const views = useTerritories.getState().territories
    expect(views).toHaveLength(1)
    expect(views[0].shared?.spaceId).toBe('space-1')
  })

  it('lets a space replace the copy sync brought, and marks it shared', () => {
    useTerritories.getState().save(card())
    useTerritories.getState().saveSpace(ownSpace(Date.now() + 60_000))
    const views = useTerritories.getState().territories
    expect(views).toHaveLength(1)
    expect(views[0].shared?.spaceId).toBe('space-1')
    expect(isMarked(useTerritories.getState().ledger[uuid(1)])).toBe(true)
    const payload = payloadFromHere()
    fresh()
    sync(payload)
    expect(personal()).toEqual([])
  })

  it('keeps no copy of a shared territory deleted on another device', () => {
    useTerritories.getState().save(card())
    useTerritories.getState().remove(uuid(1))
    useTerritories.getState().saveSpace(ownSpace(T0 + 1))
    useTerritories.getState().removeSpace('space-1', card())
    expect(useTerritories.getState().territories).toEqual([])
  })
})

describe('territory privacy mode', () => {
  it('keeps no house records from another device', () => {
    useTerritories.getState().save(card())
    const payload = payloadFromHere()
    fresh()
    usePreferences.setState({ territoryPrivacyMode: true })
    sync(payload)
    const [copy] = personal()
    expect(copy.streets[0].doors).toEqual([])
    expect(copy.doNotCalls.map((d) => d.id).sort()).toEqual([uuid(3), uuid(4)])
    expect(JSON.stringify(useTerritories.getState().ledger)).not.toContain(
      'notHome'
    )
  })
})

describe('backup files', () => {
  it('restore the territories they carry', () => {
    useTerritories.getState().save(card())
    const file = JSON.parse(JSON.stringify(backupFileContents()))
    expect(file.territoryStore.territoryRecords.length).toBe(5)
    fresh()
    expect(restoreBackupFile(file)).toEqual({ ok: true, droppedRecords: 0 })
    expect(personal().map((t) => t.number)).toEqual(['12'])
    expect(personal()[0].streets[0].doors).toHaveLength(2)
  })

  it('leave territories alone when the file has none', () => {
    useTerritories.getState().save(card())
    const { territoryStore: _none, ...file } = JSON.parse(
      JSON.stringify(backupFileContents())
    )
    expect(restoreBackupFile(file).ok).toBe(true)
    expect(personal()).toHaveLength(1)
  })
})
