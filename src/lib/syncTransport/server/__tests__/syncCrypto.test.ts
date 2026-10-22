import { randomBytes as nodeRandomBytes } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  BackupOpenError,
  type BackupPlaintext,
  deriveBackupKey,
  openBackup,
  sealBackup,
} from '@/lib/serverAccount/backupCrypto'
import {
  deriveSyncKey,
  openSyncBlob,
  sealSyncBlob,
  SYNC_SLOT_ID_PATTERN,
  syncBlobDigest,
} from '@/lib/syncTransport/server/syncCrypto'

const random = (length: number) => new Uint8Array(nodeRandomBytes(length))
const accountKey = new Uint8Array(32).fill(7)
const address = { accountId: 'A'.repeat(22), slotId: 'mfx81kq2a0b1c2d3' }
const plaintext: BackupPlaintext = {
  v: 1,
  deviceName: 'Pixel 10',
  platform: 'android',
  createdAt: 1_760_000_000_000,
  payload: { version: 1, resetEpoch: { id: 'e1', at: 5 } },
}

const problem = (open: () => unknown) => {
  try {
    open()
  } catch (error) {
    expect(error).toBeInstanceOf(BackupOpenError)
    return (error as BackupOpenError).problem
  }
  throw new Error('opened')
}

describe('sync blob', () => {
  it('derives its own key, apart from the backup key', () => {
    const key = deriveSyncKey(accountKey)
    expect(key).toHaveLength(32)
    expect(deriveSyncKey(accountKey)).toEqual(key)
    expect(key).not.toEqual(deriveBackupKey(accountKey))
    expect(() => deriveSyncKey(new Uint8Array(31))).toThrow()
  })

  it('round-trips the whole payload, reset generation included', () => {
    const key = deriveSyncKey(accountKey)
    const blob = sealSyncBlob(key, plaintext, address, random(24))
    expect(blob[0]).toBe(1)
    expect(openSyncBlob(key, blob, address)).toEqual(plaintext)
  })

  it('opens only for its own account and slot', () => {
    const key = deriveSyncKey(accountKey)
    const blob = sealSyncBlob(key, plaintext, address, random(24))
    expect(
      problem(() =>
        openSyncBlob(key, blob, { ...address, slotId: 'other-slot' })
      )
    ).toBe('decrypt')
    expect(
      problem(() =>
        openSyncBlob(key, blob, { ...address, accountId: 'B'.repeat(22) })
      )
    ).toBe('decrypt')
  })

  it("isn't interchangeable with a backup blob", () => {
    const syncKey = deriveSyncKey(accountKey)
    const backupKey = deriveBackupKey(accountKey)
    const blob = sealSyncBlob(syncKey, plaintext, address, random(24))
    expect(problem(() => openBackup(backupKey, blob, address))).toBe('decrypt')
    const backup = sealBackup(backupKey, plaintext, address, random(24))
    expect(problem(() => openSyncBlob(syncKey, backup, address))).toBe(
      'decrypt'
    )
  })

  it('names slots by sync device id', async () => {
    expect(SYNC_SLOT_ID_PATTERN.test('mfx81kq2a0b1c2d3')).toBe(true)
    expect(SYNC_SLOT_ID_PATTERN.test('short')).toBe(false)
    expect(SYNC_SLOT_ID_PATTERN.test('has/slash-in-it')).toBe(false)
    expect(await syncBlobDigest(new Uint8Array([1, 2, 3]))).toMatch(
      /^[A-Za-z0-9_-]{43}$/
    )
  })
})
