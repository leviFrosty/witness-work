import { sha256 } from '@noble/hashes/sha2.js'
import { describe, expect, it, vi } from 'vitest'
import { toB64u, utf8 } from '@/lib/bytes'
import type {
  BackupAddress,
  BackupPlaintext,
} from '@/lib/serverAccount/backupCrypto'

vi.mock('@/app/sync/clockSkew', () => ({}))
vi.mock('@/app/sync/foldRemotePayloads', () => ({}))
vi.mock('@/app/sync/iCloudSync', () => ({}))
vi.mock('@/app/sync/mergeIntoLocal', () => ({}))
vi.mock('@/app/sync/payload', () => ({}))
vi.mock('@/lib/iCloudIdentity', () => ({}))
vi.mock('@/stores/preferences', () => ({}))

import { backupPlaintextHash } from '@/app/account/backupData'

const address = { accountId: 'acct-1', slotId: 'AAAAAAAAAAAAAAAAAAAAAA' }

const plaintext = (
  overrides: Partial<BackupPlaintext> = {}
): BackupPlaintext => ({
  v: 1,
  deviceName: 'iPhone',
  platform: 'ios',
  createdAt: 1_700_000_000_000,
  payload: {
    version: 3,
    deviceId: 'device-1',
    writtenAt: 1_700_000_000_000,
    contactStore: {
      contacts: [{ id: 'c1', name: 'Ada Reyes · 日本語 🙂' }],
      deletedContacts: [],
    },
  },
  ...overrides,
})

const jsHash = (p: BackupPlaintext, a: BackupAddress) =>
  toB64u(
    sha256(
      utf8(
        JSON.stringify({
          address: a,
          deviceName: p.deviceName,
          payload: { ...(p.payload as object), writtenAt: 0 },
        })
      )
    )
  )

describe('backupPlaintextHash', () => {
  it('stays the hash stored as `lastHash` before', async () => {
    expect(await backupPlaintextHash(plaintext(), address)).toBe(
      'xxdBp66xgQw3chpZwFA5b6SwdW3KOaER7JsDW1_jQag'
    )
    for (const p of [
      plaintext(),
      plaintext({ deviceName: 'Pixel 9' }),
      plaintext({ payload: { version: 3, writtenAt: 5, contactStore: {} } }),
    ])
      expect(await backupPlaintextHash(p, address)).toBe(jsHash(p, address))
  })

  it('ignores the timestamps but not where it goes', async () => {
    const hash = await backupPlaintextHash(plaintext(), address)
    const later = plaintext({ createdAt: 1 })
    ;(later.payload as { writtenAt: number }).writtenAt = 2
    expect(await backupPlaintextHash(later, address)).toBe(hash)
    expect(
      await backupPlaintextHash(plaintext(), { ...address, slotId: 'other' })
    ).not.toBe(hash)
  })
})
