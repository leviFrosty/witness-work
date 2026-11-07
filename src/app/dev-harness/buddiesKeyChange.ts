import { getRandomBytes } from 'expo-crypto'
import * as DeviceSecrets from '../../../modules/device-secrets'
import { accountKey } from '@/app/account/accountKey'
import { fromB64u, toB64u } from '@/features/buddies/lib/bytes'
import { resetBuddiesForKeyChange } from '@/features/buddies/lib/buddiesService'
import { deriveIdentity } from '@/features/buddies/lib/keys'
import type { BuddiesKeyChangeProgress } from '@/features/buddies/lib/keyChange'
import { accountSessions } from '@/lib/serverAccount'
import { deriveAccountSigningKey } from '@/lib/serverAccount/keys'

const PREPARED = 'dev.buddies-key-change'

type Prepared = { accountId: string; oldKey: string; newKey: string }

let last: unknown = null

const readPrepared = async (): Promise<Prepared> => {
  const json = await DeviceSecrets.read(PREPARED)
  if (!json) throw new Error('No key change prepared')
  return JSON.parse(json) as Prepared
}

const tracked = (work: () => Promise<unknown>) => {
  last = null
  void work()
    .then((value) => {
      last = value ?? 'ok'
    })
    .catch((error: unknown) => {
      last = { error: String(error) }
    })
  return 'started'
}

export const buddiesKeyChangeHarness = {
  prepare: () =>
    tracked(async () => {
      const oldKey = await accountKey.peek()
      if (!oldKey) throw new Error('No account key on this device')
      const accountId = await accountSessions.withSession(
        async (_, session) => session.accountId
      )
      const newKey = getRandomBytes(32)
      const prepared: Prepared = {
        accountId,
        oldKey: toB64u(oldKey),
        newKey: toB64u(newKey),
      }
      await DeviceSecrets.write(PREPARED, JSON.stringify(prepared))
      return {
        accountId,
        newAccountPub: deriveAccountSigningKey(newKey).publicKey,
        oldInboxId: deriveIdentity(oldKey).inboxId,
        newInboxId: deriveIdentity(newKey).inboxId,
      }
    }),

  store: () =>
    tracked(async () => {
      const { accountId, oldKey, newKey } = await readPrepared()
      await accountKey.adoptChangedKey(fromB64u(oldKey), fromB64u(newKey), {
        accountId,
      })
      return 'stored'
    }),

  run: () =>
    tracked(async () => {
      const { accountId, oldKey, newKey } = await readPrepared()
      return resetBuddiesForKeyChange({
        oldKey: fromB64u(oldKey),
        newKey: fromB64u(newKey),
        accountId,
      })
    }),

  progress: () =>
    tracked(async () => {
      const json = await DeviceSecrets.read('buddies.key-change')
      if (!json) return null
      const progress = JSON.parse(json) as BuddiesKeyChangeProgress
      return {
        ...progress,
        former: progress.former.map(
          ({ inboxId, name, status, sentAt, gone, leftAt }) => ({
            inboxId,
            name,
            status,
            sentAt,
            gone,
            leftAt,
          })
        ),
      }
    }),

  newAccount: () =>
    tracked(async () => {
      const result = await accountKey.replace(getRandomBytes(32))
      return result.outcome
    }),

  clear: () => tracked(() => DeviceSecrets.remove(PREPARED)),
  get last() {
    return last
  },
}
