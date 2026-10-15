import { getRandomBytes } from 'expo-crypto'
import { accountKey } from '@/app/account/accountKey'
import { encodeRecoveryKey } from '@/lib/accountKey/recoveryKey'
import { cachedServerAccount } from '@/lib/serverAccount'
import { deriveAccountSigningKey } from '@/lib/serverAccount/keys'
import { deriveIdentity } from '@/features/buddies/lib/keys'
import { useBuddies } from '@/features/buddies/stores/buddiesStore'

let last: unknown = null

async function readAccount() {
  const key = await accountKey.peek()
  const { registeredInboxId, accountLinkedInboxId, buddies } =
    useBuddies.getState()
  return {
    hasKey: key !== null,
    accountPub: key ? deriveAccountSigningKey(key).publicKey : null,
    recoveryKey: key ? encodeRecoveryKey(key) : null,
    inboxId: key ? deriveIdentity(key).inboxId : null,
    registeredInboxId,
    accountLinkedInboxId,
    buddies: buddies.length,
    cached: cachedServerAccount(),
  }
}

/**
 * The account key for the verify harness. Reads go off the JS thread, and eval
 * doesn't await: `read()` starts one, and `last` holds its result (or `{ error
 * }`) a moment later.
 */
export const accountHarness = {
  read: () => {
    last = null
    void readAccount()
      .then((value) => {
        last = value
      })
      .catch((error: unknown) => {
        last = { error: String(error) }
      })
    return 'started'
  },
  get last() {
    return last
  },
  /** A valid recovery key for a new random account key, to type or paste. */
  randomRecoveryKey: () => encodeRecoveryKey(getRandomBytes(32)),
}
