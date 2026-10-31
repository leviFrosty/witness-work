import { getRandomBytes } from 'expo-crypto'
import * as BuddiesKeychain from '../../../modules/buddies-keychain'
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
import { useHandoffDebug } from '@/app/account/handoff'
import {
  runHandoffSelfTest,
  type SelfTestStep,
} from '@/app/account/handoffSelfTest'
import { encodeRecoveryKey } from '@/lib/accountKey/recoveryKey'
import { toB64u } from '@/lib/bytes'
import { cachedServerAccount } from '@/lib/serverAccount'
import { useBackupState } from '@/lib/serverAccount/backupStore'
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
  /**
   * Replaces the account key in the Keychain without the app's key change, as
   * iCloud Keychain brings a key replaced on another of the User's devices: the
   * stored session stays the old key's. `last` says when it's done.
   */
  replaceKeyBehindApp: () => {
    last = null
    void BuddiesKeychain.replaceRootSeed(toB64u(getRandomBytes(32))).then(
      () => (last = 'replaced'),
      (error: unknown) => (last = { error: String(error) })
    )
    return 'started'
  },
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
