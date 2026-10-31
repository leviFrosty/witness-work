import { getRandomBytes } from 'expo-crypto'
import { accountKey } from '@/app/account/accountKey'
import {
  backUpNow,
  deleteAllBackups,
  disableBackup,
  enableBackup,
  refreshBackupSlots,
} from '@/app/account/backup'
import { payloadCounts } from '@/app/account/backupData'
import {
  dryRunRestore,
  inspectBackups,
  offerRestore,
  type RestoreSource,
  simulateCorruptDownload,
} from '@/app/account/backupRestore'
import { useApprovalDebug } from '@/app/account/approval'
import { useHandoffDebug } from '@/app/account/handoff'
import { readPasskeyOffer } from '@/app/account/passkeyOffer'
import { phonePasskeySupport, simulatePasskeyAdd } from '@/app/account/passkeys'
import { earnPasskeyPrompt } from '@/app/account/passkeyPrompt'
import {
  runHandoffSelfTest,
  type SelfTestStep,
} from '@/app/account/handoffSelfTest'
import { encodeRecoveryKey } from '@/lib/accountKey/recoveryKey'
import { cachedServerAccount } from '@/lib/serverAccount'
import { useBackupState } from '@/lib/serverAccount/backupStore'
import { deriveAccountSigningKey } from '@/lib/serverAccount/keys'
import { deriveIdentity } from '@/features/buddies/lib/keys'
import { useBuddies } from '@/features/buddies/stores/buddiesStore'
import { navigationRef } from '@/features/contacts/lib/linking'
import {
  PASSKEY_PROMPT_INITIAL,
  type PasskeyPromptReason,
} from '@/lib/passkeys/promptRules'
import { usePreferences } from '@/stores/preferences'

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

export const approvalHarness = {
  state: () => {
    const { session, entry } = useApprovalDebug.getState()
    return session ? { entry, ...session.debug() } : null
  },
  /** Hands a computer's code to Sign In on a Computer, as its scanner would. */
  scan: (link: string) => {
    if (!navigationRef.isReady()) return 'navigation not ready'
    navigationRef.navigate('Sign In on a Computer', { entry: 'tools', link })
    return 'opened'
  },
}

let backupLast: unknown = null

/** Starts `work`; its result (or `{ error }`) lands in `backup.last`. */
const tracked = (work: () => Promise<unknown>) => {
  backupLast = null
  void work()
    .then((value) => {
      backupLast = value ?? { done: true }
    })
    .catch((error: unknown) => {
      backupLast = { error: String(error) }
    })
  return 'started'
}

/**
 * The account backup for the verify harness. Reads of this device's state are
 * synchronous (`state()`); anything that talks to the server starts and puts
 * its result in `last` a moment later. Decrypted slots come back as counts,
 * never records.
 */
export const backupHarness = {
  state: () => {
    const state = useBackupState.getState()
    return {
      enabled: state.enabled,
      slotId: state.slotId,
      uploading: state.uploading,
      restoring: state.restoring,
      schedule: state.schedule,
      slots: state.slots,
      restoreOfferedFor: state.restoreOfferedFor,
      log: state.log.slice(0, 15),
    }
  },
  enable: () => tracked(() => enableBackup('settings')),
  disable: (deleteServerCopy = false) =>
    tracked(() => disableBackup({ deleteServerCopy })),
  uploadNow: () => tracked(() => backUpNow('harness')),
  list: () => tracked(() => refreshBackupSlots()),
  inspect: () =>
    tracked(async () => {
      const inspection = await inspectBackups()
      return inspection?.slots.map((slot) =>
        slot.ok
          ? {
              slotId: slot.slotId,
              mine: slot.slotId === useBackupState.getState().slotId,
              deviceName: slot.deviceName,
              platform: slot.platform,
              counts: payloadCounts(slot.payload),
            }
          : { slotId: slot.slotId, problem: slot.problem }
      )
    }),
  dryRun: () =>
    tracked(async () => {
      const inspection = await inspectBackups()
      return inspection ? dryRunRestore(inspection.slots) : null
    }),
  offerRestore: (source: RestoreSource = 'tools') =>
    tracked(() => offerRestore(source, { quietWhenNone: false })),
  deleteAll: () => tracked(() => deleteAllBackups('tools')),
  simulateCorruptDownload: () => {
    simulateCorruptDownload()
    return 'armed'
  },
  get last() {
    return backupLast
  },
}

let passkeyOffer: unknown = null

/**
 * The gentle passkey prompt for the verify harness: `state()` is its stored
 * state, `earn(reason)` starts over and earns it (as turning on Cloud Sync or
 * backup, or setting up another device, would), `reset()` clears it, and
 * `readOffer()` then `offer` a moment later gives the verdict and this phone's
 * passkey support. `mockAdd('added' | 'failed')` makes the next Add a Passkey
 * end that way without the system's sheet; `mockAdd(null)` clears it.
 */
export const passkeyPromptHarness = {
  state: () => usePreferences.getState().passkeyPrompt,
  earn: (reason: PasskeyPromptReason = 'backup') => {
    usePreferences.setState({ passkeyPrompt: PASSKEY_PROMPT_INITIAL })
    earnPasskeyPrompt(reason)
    return usePreferences.getState().passkeyPrompt
  },
  reset: () => {
    usePreferences.setState({ passkeyPrompt: PASSKEY_PROMPT_INITIAL })
    return PASSKEY_PROMPT_INITIAL
  },
  mockAdd: (result: 'added' | 'failed' | null) => {
    simulatePasskeyAdd(
      result === 'added'
        ? { status: 'added', credentialId: 'verify-passkey', canUnlock: true }
        : result === 'failed'
          ? { status: 'failed', step: 'create', reason: 'failed' }
          : null
    )
    return result
  },
  readOffer: () => {
    passkeyOffer = null
    void Promise.all([readPasskeyOffer(), phonePasskeySupport()]).then(
      ([offer, support]) => {
        passkeyOffer = { offer, support }
      }
    )
    return 'started'
  },
  get offer() {
    return passkeyOffer
  },
}
