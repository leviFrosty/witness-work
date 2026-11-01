import { randomBytes as nodeRandomBytes } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { HttpError } from '@/lib/http/request'
import {
  type BackupClientOptions,
  deleteBackup,
  getBackup,
  listBackups,
  putBackup,
} from '@/lib/serverAccount/backupClient'
import {
  BackupOpenError,
  deriveBackupKey,
  newBackupSlotId,
  openBackup,
  sealBackup,
} from '@/lib/serverAccount/backupCrypto'
import { deriveAccountSigningKey } from '@/lib/serverAccount/keys'
import {
  interopAccount,
  interopEnabled,
  interopRelayUrl,
} from '@/lib/serverAccount/testing/interopSessions'

vi.mock('@/lib/logger', () => import('@/__tests__/mocks/logger'))
vi.mock('@/lib/http/online', () => ({ isKnownOffline: () => false }))

const random = (length: number) => new Uint8Array(nodeRandomBytes(length))

async function account() {
  const { accountKey, accountId, bearer } = await interopAccount(random)
  const options: BackupClientOptions = {
    ...bearer,
    sign: {
      baseUrl: interopRelayUrl!,
      key: deriveAccountSigningKey(accountKey),
      now: Date.now,
      randomBytes: random,
    },
  }
  return { accountKey, accountId, options }
}

const code = (error: unknown) =>
  error instanceof HttpError ? error.serverCode : String(error)

describe.skipIf(!interopEnabled)('backup against a real worker', () => {
  it('puts, lists, gets, and deletes slots', async () => {
    const { accountKey, accountId, options } = await account()
    const backupKey = deriveBackupKey(accountKey)
    const phone = newBackupSlotId(random)
    const tablet = newBackupSlotId(random)
    const plaintext = (deviceName: string) => ({
      v: 1,
      deviceName,
      platform: 'ios' as const,
      createdAt: Date.now(),
      payload: { version: 1, note: deviceName },
    })
    const phoneBlob = sealBackup(
      backupKey,
      plaintext('Phone'),
      { accountId, slotId: phone },
      random(24)
    )
    const put = await putBackup(options, phone, phoneBlob)
    expect(put.uploadedAt).toBeGreaterThan(0)
    await putBackup(
      options,
      tablet,
      sealBackup(
        backupKey,
        plaintext('Tablet'),
        { accountId, slotId: tablet },
        random(24)
      )
    )

    const slots = await listBackups(options)
    expect(slots.map((slot) => slot.slotId).sort()).toEqual(
      [phone, tablet].sort()
    )
    expect(slots.find((slot) => slot.slotId === phone)?.size).toBe(
      phoneBlob.length
    )

    const fetched = await getBackup(options, phone)
    expect(fetched).toEqual(phoneBlob)
    expect(
      openBackup(backupKey, fetched, { accountId, slotId: phone }).deviceName
    ).toBe('Phone')

    expect(() =>
      openBackup(backupKey, fetched, { accountId, slotId: tablet })
    ).toThrow(BackupOpenError)

    expect(
      code(await putBackup(options, phone, phoneBlob).catch((e) => e))
    ).toBe('rate_limited')

    await deleteBackup(options, phone)
    expect(code(await getBackup(options, phone).catch((e) => e))).toBe(
      'not_found'
    )
    expect((await listBackups(options)).map((slot) => slot.slotId)).toEqual([
      tablet,
    ])
    await deleteBackup(options)
    expect(await listBackups(options)).toEqual([])
  })

  it('refuses a body that doesn’t match its digest', async () => {
    const { options } = await account()
    const slotId = newBackupSlotId(random)
    const failure = await putBackup(
      { ...options, fetchImpl: tamperingFetch },
      slotId,
      random(64)
    ).catch((error: unknown) => error)
    expect(code(failure)).toBe('bad_request')
  })
})

const tamperingFetch: typeof fetch = (input, init) => {
  const body: unknown = init?.body
  if (body instanceof Uint8Array) {
    const changed = body.slice()
    changed[0] ^= 1
    return fetch(input, { ...init, body: changed })
  }
  return fetch(input, init)
}
