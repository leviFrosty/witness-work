import { describe, expect, it } from 'vitest'
import {
  SyncDeviceFile,
  listSyncDevices,
  mergeSyncDeviceFiles,
  syncDeviceAgeBucket,
  syncDeviceHint,
  syncDeviceRemoval,
} from '@/lib/syncDevices'

const DAY = 24 * 60 * 60 * 1000
const NOW = 1_800_000_000_000

const entry = (overrides: Partial<SyncDeviceFile> = {}): SyncDeviceFile => ({
  deviceId: 'phone',
  deviceName: 'iPhone',
  writtenAt: NOW - DAY,
  modifiedAt: NOW - DAY,
  status: 'ok',
  seenAt: NOW,
  ...overrides,
})

describe('mergeSyncDeviceFiles', () => {
  const previous = {
    'witness-work-phone.json': entry(),
    'witness-work-old.json': entry({ deviceId: 'old', deviceName: 'iPad' }),
  }

  it('drops files no longer listed only after a complete read', () => {
    const observed = { 'witness-work-phone.json': entry({ seenAt: NOW + 1 }) }
    expect(Object.keys(mergeSyncDeviceFiles(previous, observed, true))).toEqual(
      ['witness-work-phone.json']
    )
    const partial = mergeSyncDeviceFiles(previous, observed, false)
    expect(Object.keys(partial).sort()).toEqual([
      'witness-work-old.json',
      'witness-work-phone.json',
    ])
    expect(partial['witness-work-phone.json'].seenAt).toBe(NOW + 1)
  })

  it('keeps the last known name of a file it can no longer read', () => {
    const next = mergeSyncDeviceFiles(
      previous,
      {
        'witness-work-old.json': entry({
          deviceName: null,
          status: 'newer-version',
        }),
      },
      true
    )
    expect(next['witness-work-old.json']).toMatchObject({
      deviceName: 'iPad',
      status: 'newer-version',
    })
  })

  it('never records the account file', () => {
    const next = mergeSyncDeviceFiles(
      {},
      { 'witness-work-account.json': entry() },
      true
    )
    expect(next).toEqual({})
  })
})

describe('syncDeviceAgeBucket and syncDeviceHint', () => {
  it('buckets by the time since the file was written', () => {
    expect(syncDeviceAgeBucket(entry({ modifiedAt: NOW - DAY }), NOW)).toBe(
      '<30d'
    )
    expect(
      syncDeviceAgeBucket(entry({ modifiedAt: NOW - 45 * DAY }), NOW)
    ).toBe('30-90d')
    expect(
      syncDeviceAgeBucket(entry({ modifiedAt: NOW - 90 * DAY }), NOW)
    ).toBe('90d+')
  })

  it('hints the status first, then a legacy file, then age', () => {
    const old = NOW - 120 * DAY
    expect(
      syncDeviceHint(
        'witness-work-a.json',
        entry({ status: 'pre-reset', modifiedAt: old }),
        NOW
      )
    ).toBe('pre-reset')
    expect(
      syncDeviceHint(
        'witness-work-a.json',
        entry({ status: 'newer-version' }),
        NOW
      )
    ).toBe('newer-version')
    expect(
      syncDeviceHint(
        'witness-work-a.json',
        entry({ status: 'unreadable' }),
        NOW
      )
    ).toBe('unreadable')
    expect(
      syncDeviceHint('witness-work 2.json', entry({ modifiedAt: old }), NOW)
    ).toBe('legacy')
    expect(
      syncDeviceHint('witness-work-a.json', entry({ modifiedAt: old }), NOW)
    ).toBe('stale')
    expect(syncDeviceHint('witness-work-a.json', entry(), NOW)).toBeNull()
  })
})

describe('syncDeviceRemoval', () => {
  const complete = { complete: true, issue: null, since: NOW }

  it('needs a complete pull with no issue that read a current snapshot', () => {
    expect(syncDeviceRemoval(entry(), complete)).toBe('allowed')
    expect(syncDeviceRemoval(entry(), { ...complete, complete: false })).toBe(
      'sync-first'
    )
    expect(
      syncDeviceRemoval(entry(), { ...complete, issue: 'read-failed' })
    ).toBe('sync-first')
    expect(syncDeviceRemoval(entry({ seenAt: NOW - 1 }), complete)).toBe(
      'sync-first'
    )
  })

  it('lets pre-reset and unreadable files go while pulls are incomplete', () => {
    const incomplete = { complete: false, issue: 'read-failed', since: NOW }
    expect(syncDeviceRemoval(entry({ status: 'pre-reset' }), incomplete)).toBe(
      'allowed'
    )
    expect(syncDeviceRemoval(entry({ status: 'unreadable' }), incomplete)).toBe(
      'allowed'
    )
    // Not read by that pull: it may since be a current snapshot.
    expect(
      syncDeviceRemoval(
        entry({ status: 'pre-reset', seenAt: NOW - 1 }),
        incomplete
      )
    ).toBe('sync-first')
  })

  it('keeps a newer-version file until this device can read it', () => {
    expect(
      syncDeviceRemoval(entry({ status: 'newer-version' }), complete)
    ).toBe('update-app')
  })
})

describe('listSyncDevices', () => {
  it('puts this device first, then the most recent, and never the account file', () => {
    const list = listSyncDevices(
      {
        'witness-work-account.json': entry(),
        'witness-work-old.json': entry({ modifiedAt: NOW - 10 * DAY }),
        'witness-work-new.json': entry({ modifiedAt: NOW - DAY }),
        'witness-work-me.json': entry({ modifiedAt: NOW - 20 * DAY }),
      },
      'me'
    )
    expect(list.map((d) => [d.filename, d.isThisDevice])).toEqual([
      ['witness-work-me.json', true],
      ['witness-work-new.json', false],
      ['witness-work-old.json', false],
    ])
  })

  it('tolerates missing or malformed stored entries', () => {
    expect(listSyncDevices(undefined, 'me')).toEqual([])
    expect(
      listSyncDevices(
        { 'witness-work-x.json': null as unknown as SyncDeviceFile },
        'me'
      )
    ).toEqual([])
  })
})
