import { getRandomBytes } from 'expo-crypto'
import apis from '@/constants/apis'
import { keyChange } from '@/app/account/keyChange'
import { useKeyChangeStatus } from '@/app/account/keyChange/status'
import { deviceAccountKey } from '@/lib/accountKey'
import { keyChangedElsewhere } from '@/lib/accountKey/keyChangedElsewhere'
import { fromB64u, toB64u } from '@/lib/bytes'
import { createPasskey, getPasskey } from '@/lib/passkeys'
import type { PublicKeyCredentialCreationOptionsJSON } from '@/lib/passkeys/types'
import { syncNow } from '@/lib/syncClock'
import {
  accountSessions,
  bearerOptions,
  fetchServerAccountInfo,
  olderAccountKeys,
  olderPhotoKeys,
} from '@/lib/serverAccount'
import { deriveAccountSigningKey } from '@/lib/serverAccount/keys'
import {
  addPasskey,
  listPasskeys,
  passkeyRegistrationOptions,
  type PasskeyResponseJSON,
  savePasskeyWrap,
} from '@/lib/serverAccount/passkeyClient'
import { newPasskeyWrapId, wrapAccountKey } from '@/lib/serverAccount/passkeys'
import { getBackup, listBackups } from '@/lib/serverAccount/backupClient'
import {
  backupAad,
  deriveBackupKey,
  resealBlob,
} from '@/lib/serverAccount/backupCrypto'
import { accountPubOf } from '@/lib/serverAccount/keys'
import { isCloudSyncPhotoFilename } from '@/lib/syncTransport/imageNames'
import {
  derivePhotoKeys,
  openPhotoMeta,
  type PhotoKeys,
} from '@/lib/syncTransport/server/photoCrypto'
import {
  getSyncSlot,
  listSyncPhotos,
  listSyncSlots,
} from '@/lib/syncTransport/server/syncClient'
import { deriveSyncKey, syncAad } from '@/lib/syncTransport/server/syncCrypto'

let keyChangeLast: unknown = null

const harnessKey = async () => {
  const seed = await deviceAccountKey.peek()
  if (!seed) throw new Error('no account key')
  return fromB64u(seed)
}

const tracked = (work: () => Promise<unknown>) => {
  keyChangeLast = null
  void work()
    .then((value) => {
      keyChangeLast = value ?? { done: true }
    })
    .catch((error: unknown) => {
      keyChangeLast = { error: String(error) }
    })
  return 'started'
}

const opensWith = (
  blob: Uint8Array,
  aad: Uint8Array,
  current: Uint8Array,
  older: readonly Uint8Array[]
) => {
  const probe = { to: current, nonce: new Uint8Array(24) }
  if (resealBlob(blob, aad, { ...probe, from: [] }).outcome === 'current')
    return 'current'
  return resealBlob(blob, aad, { ...probe, from: older }).outcome === 'resealed'
    ? 'older'
    : 'none'
}

export const keyChangeHarness = {
  state: () => ({
    stage: useKeyChangeStatus.getState().stage,
    signedOutElsewhere: keyChangedElsewhere(),
    session: accountSessions.snapshot()
      ? {
          accountId: accountSessions.snapshot()!.accountId,
          accountPub: accountSessions.snapshot()!.accountPub,
        }
      : null,
  }),
  get last() {
    return keyChangeLast
  },
  resume: () => tracked(() => keyChange.resume()),

  passkeys: () =>
    tracked(async () => {
      const key = await harnessKey()
      const { passkeys } = await listPasskeys(bearerOptions(key))
      return passkeys.map(({ credentialId, canUnlock }) => ({
        credentialId,
        canUnlock,
      }))
    }),

  addPasskey: () =>
    tracked(async () => {
      const key = await harnessKey()
      const options = {
        ...bearerOptions(key),
        sign: {
          baseUrl: apis.accounts,
          key: deriveAccountSigningKey(key),
          now: syncNow,
          randomBytes: getRandomBytes,
        },
      }
      const registration = await passkeyRegistrationOptions({}, options)
      const created = await createPasskey(
        registration.options as unknown as PublicKeyCredentialCreationOptionsJSON
      )
      const { credentialId } = await addPasskey(
        {
          challengeToken: registration.challengeToken,
          response: created.response as unknown as PasskeyResponseJSON,
        },
        options
      )
      const prf =
        created.prf.first ??
        (
          await getPasskey({
            challenge: toB64u(getRandomBytes(32)),
            allowCredentials: [{ id: credentialId, type: 'public-key' }],
            userVerification: 'required',
          })
        ).prf
      if (!prf) return { credentialId, canUnlock: false }
      const session = accountSessions.snapshot()
      const { keyEpoch } = await fetchServerAccountInfo(key)
      await savePasskeyWrap(
        {
          credentialId,
          wrapId: newPasskeyWrapId(getRandomBytes),
          keyEpoch,
          wrap: wrapAccountKey(
            {
              accountId: session!.accountId,
              credentialId,
              keyEpoch,
              prfOutput: prf,
              accountKey: key,
            },
            getRandomBytes(24)
          ),
        },
        options
      )
      return { credentialId, canUnlock: true }
    }),
  inspect: () =>
    tracked(async () => {
      const seed = await deviceAccountKey.peek()
      if (!seed) return { error: 'no account key' }
      const key = fromB64u(seed)
      const session = accountSessions.snapshot()
      if (!session) return { error: 'no session' }
      const { accountId } = session
      const options = bearerOptions(key)
      const syncKey = deriveSyncKey(key)
      const olderSync = await olderAccountKeys(accountId, 'sync')
      const { slots } = await listSyncSlots(options).catch(() => ({
        slots: [],
      }))
      const syncSlots = []
      for (const { slotId, updatedAt } of slots)
        syncSlots.push({
          slotId,
          updatedAt,
          opensWith: opensWith(
            await getSyncSlot(options, slotId),
            syncAad({ accountId, slotId }),
            syncKey,
            olderSync
          ),
        })
      const backupKey = deriveBackupKey(key)
      const olderBackup = await olderAccountKeys(accountId, 'backup')
      const backupSlots = []
      for (const { slotId, uploadedAt } of await listBackups(options))
        backupSlots.push({
          slotId,
          uploadedAt,
          opensWith: opensWith(
            await getBackup(options, slotId),
            backupAad({ accountId, slotId }),
            backupKey,
            olderBackup
          ),
        })

      const currentPhotos = derivePhotoKeys(key)
      const olderPhotos: PhotoKeys[] = (await olderPhotoKeys(accountId)).map(
        ({ name, photo }) => ({ nameKey: name, photoKey: photo })
      )
      const opens = (keys: PhotoKeys, name: string, meta: string) =>
        openPhotoMeta(
          keys.photoKey,
          meta,
          { accountId, name },
          keys.nameKey,
          isCloudSyncPhotoFilename
        ) !== null
      const photos = { current: 0, older: 0, none: 0 }
      let cursor: string | null = null
      do {
        const page: Awaited<ReturnType<typeof listSyncPhotos>> | null =
          await listSyncPhotos(options, cursor).catch(() => null)
        if (!page) break
        for (const { name, meta } of page.photos)
          photos[
            opens(currentPhotos, name, meta)
              ? 'current'
              : olderPhotos.some((older) => opens(older, name, meta))
                ? 'older'
                : 'none'
          ]++
        cursor = page.cursor
      } while (cursor)
      return {
        accountId,
        accountPub: accountPubOf(key),
        syncSlots,
        photos,
        backupSlots,
      }
    }),
}
