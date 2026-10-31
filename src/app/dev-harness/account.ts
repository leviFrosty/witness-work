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
import { useApprovalDebug } from '@/app/account/approval'
import { useHandoffDebug } from '@/app/account/handoff'
import {
  runHandoffSelfTest,
  type SelfTestStep,
} from '@/app/account/handoffSelfTest'
import { encodeRecoveryKey } from '@/lib/accountKey/recoveryKey'
import { toB64u, utf8 } from '@/lib/bytes'
import apis from '@/constants/apis'
import { accountSessions, cachedServerAccount } from '@/lib/serverAccount'
import { useBackupState } from '@/lib/serverAccount/backupStore'
import {
  deriveAccountSigningKey,
  signAccountRequest,
} from '@/lib/serverAccount/keys'
import { deriveIdentity } from '@/features/buddies/lib/keys'
import { useBuddies } from '@/features/buddies/stores/buddiesStore'
import { navigationRef } from '@/features/contacts/lib/linking'

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
  /**
   * Another of the User's devices changes the account key (ADR 0039): the same
   * account under a new key on the server, which iCloud Keychain then brings
   * here behind the app, leaving the old key's session stored. Commits through
   * this device's session, so it isn't signed out the way another device's
   * change would sign it out. `last` says when it's done.
   */
  changeKeyElsewhere: () => {
    last = null
    void changeKeyElsewhere().then(
      (value) => (last = value),
      (error: unknown) => (last = { error: String(error) })
    )
    return 'started'
  },
}

async function changeKeyElsewhere() {
  const oldKey = await accountKey.peek()
  if (!oldKey) throw new Error('No account key')
  const newKey = getRandomBytes(32)
  const oldSigning = deriveAccountSigningKey(oldKey)
  const newSigning = deriveAccountSigningKey(newKey)
  const send = (keyEpoch: number) => {
    const bytes = utf8(
      JSON.stringify({
        accountPub: oldSigning.publicKey,
        ts: Date.now(),
        nonce: toB64u(getRandomBytes(16)),
        newAccountPub: newSigning.publicKey,
        keyEpoch,
        history: toB64u(getRandomBytes(64)),
      })
    )
    return accountSessions.request<{ keyEpoch?: number }>({
      url: `${apis.accounts}/accounts/v1/account/rekey`,
      method: 'POST',
      json: {
        payload: toB64u(bytes),
        signature: signAccountRequest('account/rekey', bytes, oldSigning),
        newSignature: signAccountRequest(
          'account/rekey/new',
          bytes,
          newSigning
        ),
      },
      timeoutMs: 15_000,
    })
  }
  // The epoch isn't kept here: try the first few.
  let failure: unknown = null
  for (const keyEpoch of [0, 1, 2, 3, 4]) {
    try {
      await send(keyEpoch)
      failure = null
      break
    } catch (error) {
      failure = error
    }
  }
  if (failure) throw failure
  await BuddiesKeychain.replaceRootSeed(toB64u(newKey))
  return {
    changed: true,
    oldAccountPub: oldSigning.publicKey.slice(0, 12),
    newAccountPub: newSigning.publicKey.slice(0, 12),
  }
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
