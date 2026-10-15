import { getRandomBytes } from 'expo-crypto'
import { accountKey } from '@/app/account/accountKey'
import { useHandoffDebug } from '@/app/account/handoff'
import {
  runHandoffSelfTest,
  type SelfTestStep,
} from '@/app/account/handoffSelfTest'
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

let selfTest: { passed: boolean | null; steps: SelfTestStep[] } | null = null

/**
 * Set Up Another Device for the verify harness: the current or last session on
 * this device, the QR link while one shows (dev only, secret included), and the
 * Tools self-test (`selfTest()`, then `selfTestResult` a moment later).
 */
export const handoffHarness = {
  state: () => {
    const { session, entry } = useHandoffDebug.getState()
    return session ? { entry, ...session.debug() } : null
  },
  link: () => {
    const session = useHandoffDebug.getState().session
    if (session?.role !== 'offer') return null
    const state = session.state
    return state.step === 'waiting' ? state.link : null
  },
  selfTest: () => {
    selfTest = { passed: null, steps: [] }
    const run = selfTest
    void runHandoffSelfTest((step) => run.steps.push(step))
      .then((passed) => {
        run.passed = passed
      })
      .catch(() => {
        run.passed = false
      })
    return 'started'
  },
  get selfTestResult() {
    return selfTest
  },
}
