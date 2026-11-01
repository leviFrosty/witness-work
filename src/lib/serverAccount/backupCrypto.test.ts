import { randomBytes as nodeRandomBytes } from 'node:crypto'
import { gzipSync } from 'fflate'
import { xchacha20poly1305 } from '@noble/ciphers/chacha.js'
import { describe, expect, it } from 'vitest'
import { concatBytes, utf8 } from '@/lib/bytes'
import {
  backupAad,
  backupBlobDigest,
  BackupOpenError,
  type BackupPlaintext,
  deriveBackupKey,
  newBackupSlotId,
  openBackup,
  sealBackup,
} from '@/lib/serverAccount/backupCrypto'

const random = (length: number) => new Uint8Array(nodeRandomBytes(length))
const accountKey = new Uint8Array(32).fill(7)
const address = { accountId: 'A'.repeat(22), slotId: 'S'.repeat(22) }
const plaintext: BackupPlaintext = {
  v: 1,
  deviceName: 'iPhone 18 Pro',
  platform: 'ios',
  createdAt: 1_760_000_000_000,
  payload: { version: 1, contactStore: { contacts: [{ id: 'c1' }] } },
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

describe('backup blob', () => {
  it('derives the backup key with its own label', () => {
    const key = deriveBackupKey(accountKey)
    expect(key).toHaveLength(32)
    expect(deriveBackupKey(accountKey)).toEqual(key)
    expect(deriveBackupKey(new Uint8Array(32).fill(8))).not.toEqual(key)
    expect(() => deriveBackupKey(new Uint8Array(16))).toThrow()
  })

  it('round-trips: 0x01, a 24-byte nonce, then the sealed gzip', () => {
    const key = deriveBackupKey(accountKey)
    const nonce = random(24)
    const blob = sealBackup(key, plaintext, address, nonce)
    expect(blob[0]).toBe(1)
    expect(blob.subarray(1, 25)).toEqual(nonce)
    expect(openBackup(key, blob, address)).toEqual(plaintext)
  })

  it('compresses, so the blob is smaller than its JSON', () => {
    const big = {
      ...plaintext,
      payload: {
        contacts: Array.from({ length: 200 }, (_, i) => ({
          id: `contact-${i}`,
          name: 'Sample Name',
          address: '1 Sample Street',
        })),
      },
    }
    const blob = sealBackup(
      deriveBackupKey(accountKey),
      big,
      address,
      random(24)
    )
    expect(blob.length).toBeLessThan(JSON.stringify(big).length / 4)
  })

  it('refuses another account key', () => {
    const blob = sealBackup(
      deriveBackupKey(accountKey),
      plaintext,
      address,
      random(24)
    )
    const other = deriveBackupKey(new Uint8Array(32).fill(9))
    expect(problem(() => openBackup(other, blob, address))).toBe('decrypt')
  })

  it('refuses a blob moved to another slot or another account', () => {
    const key = deriveBackupKey(accountKey)
    const blob = sealBackup(key, plaintext, address, random(24))
    expect(
      problem(() =>
        openBackup(key, blob, { ...address, slotId: 'T'.repeat(22) })
      )
    ).toBe('decrypt')
    expect(
      problem(() =>
        openBackup(key, blob, { ...address, accountId: 'B'.repeat(22) })
      )
    ).toBe('decrypt')
  })

  it('refuses any tampered byte, and anything that isn’t a blob', () => {
    const key = deriveBackupKey(accountKey)
    const blob = sealBackup(key, plaintext, address, random(24))
    for (const index of [1, 24, 25, blob.length - 1]) {
      const tampered = blob.slice()
      tampered[index] ^= 1
      expect(problem(() => openBackup(key, tampered, address))).toBe('decrypt')
    }
    const versioned = blob.slice()
    versioned[0] = 2
    expect(problem(() => openBackup(key, versioned, address))).toBe('format')
    expect(problem(() => openBackup(key, blob.subarray(0, 40), address))).toBe(
      'format'
    )
    expect(problem(() => openBackup(key, new Uint8Array(0), address))).toBe(
      'format'
    )
  })

  const sealRaw = (key: Uint8Array, contents: Uint8Array) => {
    const nonce = random(24)
    return concatBytes(
      new Uint8Array([1]),
      nonce,
      xchacha20poly1305(key, nonce, backupAad(address)).encrypt(contents)
    )
  }

  it('says when the contents aren’t a backup, or are from a newer app', () => {
    const key = deriveBackupKey(accountKey)
    expect(
      problem(() => openBackup(key, sealRaw(key, utf8('not gzip')), address))
    ).toBe('contents')
    expect(
      problem(() =>
        openBackup(key, sealRaw(key, gzipSync(utf8('{"v":1}'))), address)
      )
    ).toBe('contents')
    expect(
      problem(() =>
        openBackup(
          key,
          sealRaw(key, gzipSync(utf8(JSON.stringify({ ...plaintext, v: 2 })))),
          address
        )
      )
    ).toBe('newer')
  })

  it('makes 16-byte slot ids and the digest the server checks', async () => {
    expect(newBackupSlotId(random)).toMatch(/^[A-Za-z0-9_-]{22}$/)
    expect(await backupBlobDigest(new Uint8Array([1, 2, 3]))).toBe(
      'A5BYxvLAy0ksUzsKTRTvd8wPeKvMztUofYShogEc-4E'
    )
  })
})
