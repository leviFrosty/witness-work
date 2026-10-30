import { randomBytes as nodeRandomBytes } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import type { KeyChangeRecord } from '@/lib/accountKey/keyChangeRecord'
import {
  getBackup,
  getBackupSlot,
  listBackups,
  putBackup,
} from '@/lib/serverAccount/backupClient'
import {
  deriveBackupKey,
  newBackupSlotId,
  openBackup,
  sealBackup,
} from '@/lib/serverAccount/backupCrypto'
import type { BearerAccountOptions } from '@/lib/serverAccount/client'
import { rekeyAccount } from '@/lib/serverAccount/keyChangeClient'
import {
  appendKeyHistory,
  keyHistoryEntry,
  sealKeyHistory,
} from '@/lib/serverAccount/keyHistory'
import { deriveAccountSigningKey } from '@/lib/serverAccount/keys'
import {
  interopAccount,
  interopEnabled,
  interopRelayUrl,
  interopSessions,
} from '@/lib/serverAccount/testing/interopSessions'
import {
  derivePhotoKeys,
  openPhoto,
  openPhotoMeta,
  photoName,
  sealPhoto,
  sealPhotoMeta,
} from '@/lib/syncTransport/server/photoCrypto'
import {
  getSyncPhoto,
  getSyncSlot,
  listSyncPhotos,
  listSyncSlots,
  putSyncPhoto,
  putSyncSlot,
} from '@/lib/syncTransport/server/syncClient'
import {
  deriveSyncKey,
  openSyncBlob,
  sealSyncBlob,
} from '@/lib/syncTransport/server/syncCrypto'
import { createResealStep, resealPhotoApi } from './reseal'

vi.mock('@/lib/logger', () => import('@/__tests__/mocks/logger'))
vi.mock('@/lib/http/online', () => ({ isKnownOffline: () => false }))

/**
 * Opt-in contract check of the key change's re-seal step (step 5) against a
 * real worker (see `interopSessions`; docs/account-key-change.md). Skipped by
 * default. Cloud Sync needs a Supporter: the account links a RevenueCat
 * customer, so start the worker with `REVENUECAT_API_URL` at a fake that
 * answers one (ww-api's `scripts/verify/dev.mjs`).
 */
const random = (length: number) => new Uint8Array(nodeRandomBytes(length))
const pub = (key: Uint8Array) => deriveAccountSigningKey(key).publicKey
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
const slotId = () => `slot-${Buffer.from(random(9)).toString('base64url')}`

const PHOTOS = [
  'witness-work-img-contact-c1--r1.jpg',
  'witness-work-note-note0001.jpg',
]
const photoFile = (index: number) => new Uint8Array(2_000 + index).fill(index)

const plaintext = (deviceName: string) => ({
  v: 1,
  deviceName,
  platform: 'ios' as const,
  createdAt: Date.now(),
  payload: { version: 1, contactStore: { contacts: [{ id: deviceName }] } },
})

describe.skipIf(!interopEnabled)('re-sealing against a real worker', () => {
  it('moves every slot and photo to the new key, other devices’ too, with If-Match and x-ww-reseal', async () => {
    // This phone, and a tablet signed in to the same account.
    const phone = await interopAccount(random)
    const K1 = phone.accountKey
    const { accountId } = phone
    await phone.sessions.request({
      url: `${interopRelayUrl}/accounts/v1/revenuecat-customers`,
      method: 'POST',
      json: { appUserId: `interop-${slotId()}` },
      timeoutMs: 10_000,
    })
    const tablet = interopSessions(random, K1)
    await tablet.ensure(K1, { accountId })
    const tabletOptions: BearerAccountOptions = {
      baseUrl: interopRelayUrl!,
      authorize: (run) => tablet.withSession(run, { accountKey: K1 }),
    }

    const own = slotId()
    const theirs = slotId()
    const raced = slotId()
    const put = (
      options: BearerAccountOptions,
      id: string,
      key: Uint8Array,
      name: string
    ) =>
      putSyncSlot(
        options,
        id,
        sealSyncBlob(
          deriveSyncKey(key),
          plaintext(name),
          { accountId, slotId: id },
          random(24)
        )
      )
    await put(phone.bearer, own, K1, 'phone')
    await put(tabletOptions, theirs, K1, 'tablet')
    await put(tabletOptions, raced, K1, 'older')
    const backupSlot = newBackupSlotId(random)
    await putBackup(
      phone.bearer,
      backupSlot,
      sealBackup(
        deriveBackupKey(K1),
        plaintext('backup'),
        { accountId, slotId: backupSlot },
        random(24)
      )
    )
    // The tablet's photos, under K1's names.
    const k1Photos = derivePhotoKeys(K1)
    for (const [index, filename] of PHOTOS.entries()) {
      const address = { accountId, name: photoName(k1Photos.nameKey, filename) }
      await putSyncPhoto(
        tabletOptions,
        {
          name: address.name,
          meta: sealPhotoMeta(k1Photos.photoKey, filename, address, random(24)),
          blob: await sealPhoto(
            k1Photos.photoKey,
            photoFile(index),
            address,
            random(24)
          ),
        },
        theirs
      )
    }
    const before = (await listSyncSlots(phone.bearer)).slots

    // The change itself (steps 3 and 4).
    const K2 = random(32)
    const result = await rekeyAccount(
      {
        oldKey: K1,
        newKey: K2,
        keyEpoch: 0,
        history: sealKeyHistory(
          K2,
          accountId,
          1,
          appendKeyHistory(null, keyHistoryEntry(K1, 0, Date.now())),
          random(24)
        ),
      },
      { ...phone.bearer, now: Date.now, randomBytes: random }
    )
    if (result.outcome !== 'committed') throw new Error(result.outcome)
    await phone.sessions.repoint(pub(K1), pub(K2), {
      accessToken: result.accessToken,
      accessExpiresAt: result.accessExpiresAt,
    })
    const options: BearerAccountOptions = {
      baseUrl: interopRelayUrl!,
      authorize: (run) => phone.sessions.withSession(run, { accountKey: K2 }),
    }

    let wroteRaced = false
    let photosLeft: string | null = 'not set'
    const refusals: string[] = []
    const waits: number[] = []
    const step = createResealStep({
      sync: () => ({
        list: async () => (await listSyncSlots(options)).slots,
        get: (id) => getSyncSlot(options, id),
        put: async (id, blob, putOptions) => {
          // Newer bytes land between the read and the re-seal, more than
          // the server's 2 s apart, so the re-seal's put meets a 412.
          if (id === raced && !wroteRaced) {
            wroteRaced = true
            await pause(2_100)
            await put(options, raced, K1, 'newer')
            await pause(2_100)
          }
          try {
            await putSyncSlot(options, id, blob, putOptions)
          } catch (error) {
            refusals.push(`${id === raced ? 'raced' : id}: ${String(error)}`)
            throw error
          }
        },
      }),
      backup: () => ({
        list: () => listBackups(options),
        get: (id) => getBackupSlot(options, id),
        put: async (id, blob, putOptions) => {
          await putBackup(options, id, blob, putOptions)
        },
      }),
      photos: () => resealPhotoApi(options, () => own),
      ownSyncSlotId: () => own,
      olderKeys: async () => [],
      olderPhotoKeys: async () => [],
      photosLeft: {
        get: () => photosLeft,
        set: (id) => {
          photosLeft = id
        },
      },
      randomBytes: random,
      sleep: async (ms) => {
        waits.push(ms)
        await pause(ms)
      },
    })
    let record: KeyChangeRecord = {
      v: 1,
      accountId,
      oldKey: 'k1',
      newKey: 'k2',
      oldKeyEpoch: 0,
      stage: 'stored',
      startedAt: Date.now(),
    }
    await step({
      oldKey: K1,
      newKey: K2,
      accountId,
      record,
      save: async (reseal) => {
        record = { ...record, reseal }
      },
    })

    const after = (await listSyncSlots(options)).slots
    const name = async (id: string) =>
      openSyncBlob(deriveSyncKey(K2), await getSyncSlot(options, id), {
        accountId,
        slotId: id,
      }).deviceName
    expect(await name(own)).toBe('phone')
    expect(await name(theirs)).toBe('tablet')
    // The 412 read it again: the newer bytes, not the ones first read.
    expect(refusals).toContain('raced: HttpError: client: precondition_failed')
    // Any other refusal was a slot put under 2 s before, waited out.
    for (const refusal of refusals.filter((r) => !r.startsWith('raced')))
      expect(refusal).toMatch(/rate_limited$/)
    expect(await name(raced)).toBe('newer')
    // Another device's slot keeps its time (`x-ww-reseal`).
    const time = (slots: typeof before, id: string) =>
      slots.find((slot) => slot.slotId === id)!.updatedAt
    expect(time(after, theirs)).toBe(time(before, theirs))
    expect(
      openBackup(deriveBackupKey(K2), await getBackup(options, backupSlot), {
        accountId,
        slotId: backupSlot,
      }).deviceName
    ).toBe('backup')
    // The backup was put under a minute ago: the step waited it out.
    expect(waits.some((ms) => ms > 30_000)).toBe(true)
    // Every photo under K2's name only, opening to the same file.
    const k2Photos = derivePhotoKeys(K2)
    const listed = (await listSyncPhotos(options)).photos
    expect(listed.map((photo) => photo.name).sort()).toEqual(
      PHOTOS.map((filename) => photoName(k2Photos.nameKey, filename)).sort()
    )
    for (const [index, filename] of PHOTOS.entries()) {
      const address = { accountId, name: photoName(k2Photos.nameKey, filename) }
      const meta = listed.find((photo) => photo.name === address.name)!.meta
      expect(
        openPhotoMeta(k2Photos.photoKey, meta, address, k2Photos.nameKey)
      ).toBe(filename)
      const { blob } = await getSyncPhoto(options, address.name)
      expect(await openPhoto(k2Photos.photoKey, blob, address)).toEqual(
        photoFile(index)
      )
    }
    expect(photosLeft).toBeNull()
    expect(record.reseal).toEqual({
      syncSlots: expect.arrayContaining([own, theirs, raced]),
      photos: [],
      backupSlots: [backupSlot],
    })
  }, 150_000)
})
