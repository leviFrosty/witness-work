import { describe, expect, it } from 'vitest'
import { utf8 } from '@/lib/bytes'
import { BackupOpenError } from '@/lib/serverAccount/backupCrypto'
import { derivePhotoKeys } from '@/lib/syncTransport/server/photoCrypto'
import { deriveSyncKey } from '@/lib/syncTransport/server/syncCrypto'
import {
  openPhotoBytes,
  openPhotoName,
  openSnapshot,
  type SealKeys,
  sealKeyId,
  sealPhotoBytes,
  sealPhotoName,
  sealSnapshot,
} from '@/lib/syncTransport/sealed/sealCrypto'

const keysFor = (fill: number): SealKeys => {
  const accountKey = new Uint8Array(32).fill(fill)
  return {
    syncKey: deriveSyncKey(accountKey),
    photoKeys: derivePhotoKeys(accountKey),
  }
}
const A = keysFor(1)
const B = keysFor(2)
const nonce = (fill: number) => new Uint8Array(24).fill(fill)
const meta = { deviceName: 'iPhone', platform: 'ios' as const, createdAt: 5 }
const payload = { version: 1, contacts: [{ name: 'Ana Silva' }] }

describe('sealed snapshots', () => {
  it('round-trips and hides the payload', () => {
    const blob = sealSnapshot(
      A.syncKey,
      'witness-work-a.json',
      payload,
      meta,
      nonce(3)
    )
    expect(new TextDecoder().decode(blob)).not.toContain('Ana Silva')
    const opened = openSnapshot(
      { current: A, older: [] },
      'witness-work-a.json',
      blob
    )
    expect(opened.payload).toEqual(payload)
    expect(opened.deviceName).toBe('iPhone')
  })

  it('is bound to its device name, so a file moved to another name fails', () => {
    const blob = sealSnapshot(
      A.syncKey,
      'witness-work-a.json',
      payload,
      meta,
      nonce(3)
    )
    expect(() =>
      openSnapshot({ current: A, older: [] }, 'witness-work-b.json', blob)
    ).toThrow(BackupOpenError)
  })

  it('opens under an older key after a key change', () => {
    const blob = sealSnapshot(
      A.syncKey,
      'witness-work-a.json',
      payload,
      meta,
      nonce(3)
    )
    expect(() =>
      openSnapshot({ current: B, older: [] }, 'witness-work-a.json', blob)
    ).toThrow(BackupOpenError)
    expect(
      openSnapshot({ current: B, older: [A] }, 'witness-work-a.json', blob)
        .payload
    ).toEqual(payload)
  })

  it('never opens as a Cloud Sync slot or the other way round', async () => {
    const { openSyncBlob, sealSyncBlob } = await import(
      '@/lib/syncTransport/server/syncCrypto'
    )
    const ours = sealSnapshot(
      A.syncKey,
      'witness-work-a.json',
      payload,
      meta,
      nonce(3)
    )
    expect(() =>
      openSyncBlob(A.syncKey, ours, { accountId: 'x', slotId: 'a' })
    ).toThrow()
    const slot = sealSyncBlob(
      A.syncKey,
      { v: 1, ...meta, payload },
      { accountId: 'x', slotId: 'a' },
      nonce(4)
    )
    expect(() =>
      openSnapshot({ current: A, older: [] }, 'witness-work-a.json', slot)
    ).toThrow()
  })

  it('names keys without revealing them', () => {
    expect(sealKeyId(A.syncKey)).toMatch(/^[A-Za-z0-9_-]{22}$/)
    expect(sealKeyId(A.syncKey)).toBe(sealKeyId(keysFor(1).syncKey))
    expect(sealKeyId(A.syncKey)).not.toBe(sealKeyId(B.syncKey))
  })
})

describe('sealed photo names', () => {
  it('are deterministic, open back, and hide the filename', () => {
    const middle = 'img-contact-3f2c9a8e-1b2d-4c3e-9f00-112233445566--lq1k2abc'
    const sealed = sealPhotoName(A.photoKeys, middle)!
    expect(sealPhotoName(A.photoKeys, middle)).toBe(sealed)
    expect(sealed).not.toContain('contact')
    expect(openPhotoName(A.photoKeys, sealed)).toBe(middle)
    expect(openPhotoName(B.photoKeys, sealed)).toBeNull()
  })

  it('pad to one of two lengths', () => {
    const short = sealPhotoName(A.photoKeys, 'note-abcdefgh')!
    const longer = sealPhotoName(A.photoKeys, 'note-' + 'x'.repeat(50))!
    const longest = sealPhotoName(A.photoKeys, 'note-' + 'x'.repeat(100))!
    expect(short.length).toBe(longer.length)
    expect(longest.length).toBeGreaterThan(short.length)
    expect(20 + longest.length + 4).toBeLessThanOrEqual(255)
    expect(sealPhotoName(A.photoKeys, 'x'.repeat(128))).toBeNull()
  })

  it('refuse a name that isn’t the deterministic one for its filename', () => {
    const sealed = sealPhotoName(A.photoKeys, 'note-abcdefgh')!
    const tampered = sealed.slice(0, -2) + (sealed.endsWith('A') ? 'BB' : 'AA')
    expect(openPhotoName(A.photoKeys, tampered)).toBeNull()
  })
})

describe('sealed photo bytes', () => {
  it('round-trip and are bound to the filename', async () => {
    const bytes = utf8('jpeg bytes '.repeat(50_000))
    const blob = await sealPhotoBytes(
      A.photoKeys,
      'witness-work-note-x.jpg',
      bytes,
      nonce(9)
    )
    expect(
      await openPhotoBytes(A.photoKeys, 'witness-work-note-x.jpg', blob)
    ).toEqual(bytes)
    await expect(
      openPhotoBytes(A.photoKeys, 'witness-work-note-y.jpg', blob)
    ).rejects.toThrow()
    await expect(
      openPhotoBytes(B.photoKeys, 'witness-work-note-x.jpg', blob)
    ).rejects.toThrow()
  })
})
