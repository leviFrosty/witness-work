import { keyChange } from '@/app/account/keyChange'
import { useKeyChangeStatus } from '@/app/account/keyChange/status'
import { deviceAccountKey } from '@/lib/accountKey'
import { keyChangedElsewhere } from '@/lib/accountKey/keyChangedElsewhere'
import { fromB64u } from '@/lib/bytes'
import {
  accountSessions,
  bearerOptions,
  olderAccountKeys,
} from '@/lib/serverAccount'
import { getBackup, listBackups } from '@/lib/serverAccount/backupClient'
import {
  backupAad,
  deriveBackupKey,
  resealBlob,
} from '@/lib/serverAccount/backupCrypto'
import { accountPubOf } from '@/lib/serverAccount/keys'
import {
  getSyncSlot,
  listSyncSlots,
} from '@/lib/syncTransport/server/syncClient'
import { deriveSyncKey, syncAad } from '@/lib/syncTransport/server/syncCrypto'

let keyChangeLast: unknown = null

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

/**
 * Which key a blob opens with: `current` (this device's key), `older` (the key
 * history's), or `none`.
 */
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

/**
 * Change Account Key (ADR 0039) for the verify harness: `state()` reads the
 * change under way and the signed-out state; `inspect()` reads every Cloud Sync
 * and backup slot of the account and says which key each opens with, then
 * `keyChange.last`. Never keys or contents.
 */
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
      return {
        accountId,
        accountPub: accountPubOf(key),
        syncSlots,
        backupSlots,
      }
    }),
}
