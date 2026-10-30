import { Platform } from 'react-native'
import { getRandomBytes } from 'expo-crypto'
import { MMKV } from 'react-native-mmkv'
import * as BuddiesKeychain from '../../../../modules/buddies-keychain'
import apis from '@/constants/apis'
import { accountKey } from '@/app/account/accountKey'
import { backUpNow } from '@/app/account/backup'
import { iCloudSync } from '@/app/sync/iCloudSync'
import {
  deviceAccountKey,
  holdAccountKeyUntil,
  keyChangeAvailable,
  keyChangeRecords,
} from '@/lib/accountKey'
import {
  keyChangedElsewhere,
  setKeyChangedElsewhere,
} from '@/lib/accountKey/keyChangedElsewhere'
import { analytics } from '@/lib/analytics'
import { addForegroundListener } from '@/lib/appLifecycle'
import { fromB64u } from '@/lib/bytes'
import { getOnline } from '@/lib/http/online'
import { logger } from '@/lib/logger'
import {
  accountSessions,
  bearerOptions,
  fetchServerAccountInfo,
  keyHistoryCache,
  onAccountChange,
  onAccountKeySwitched,
  onKeyRetired,
  serverAccount,
  thisDeviceLabel,
} from '@/lib/serverAccount'
import {
  getBackupSlot,
  listBackups,
  putBackup,
} from '@/lib/serverAccount/backupClient'
import { sealDeviceLabel } from '@/lib/serverAccount/deviceLabel'
import {
  fetchKeyHistory,
  rekeyAccount,
} from '@/lib/serverAccount/keyChangeClient'
import { historyKeys } from '@/lib/serverAccount/keyHistory'
import { accountPubOf } from '@/lib/serverAccount/keys'
import { AccountSessionError } from '@/lib/serverAccount/session'
import { useBackupState } from '@/lib/serverAccount/backupStore'
import { usesCloudSync } from '@/lib/syncTransport/provider'
import { syncNow } from '@/lib/syncClock'
import {
  getSyncSlot,
  listSyncSlots,
  putSyncSlot,
} from '@/lib/syncTransport/server/syncClient'
import { buddiesEngine } from '@/features/buddies/lib/buddiesService'
import { navigationRef } from '@/features/contacts/lib/linking'
import i18n from '@/lib/locales'
import { toast } from '@/stores/toasts'
import { usePreferences } from '@/stores/preferences'
import { createKeyChangeEventGate } from './analytics'
import { createKeyChangeEngine } from './engine'
import { createResealStep } from './reseal'
import { createKeyRetiredHandler } from './retired'
import { useKeyChangeStatus } from './status'
import { keyChangeStep, registerKeyChangeStep } from './steps'

/**
 * Change Account Key on this device (ADR 0039), and what this device does when
 * the key changed on another one. The engine is `engine.ts`; this wires it to
 * the session, the stores and Cloud Sync and backup. The screens come later.
 */

/** Opens this device's session with `key`, only into `accountId`. */
async function openInto(
  key: Uint8Array,
  accountId: string
): Promise<'opened' | 'unknownAccount' | 'keyRetired'> {
  try {
    await serverAccount.connect(key, { accountId, retry: true })
    return 'opened'
  } catch (error) {
    if (error instanceof AccountSessionError) {
      if (error.failure === 'keyRetired') return 'keyRetired'
      if (error.serverCode === 'unknown_account') return 'unknownAccount'
    }
    throw error
  }
}

/** Step 0: what's on this device is on the server under the old key too. */
async function prepare(): Promise<void> {
  if (usesCloudSync() && iCloudSync.canSync()) {
    await iCloudSync.pullAndMerge('key-change')
    await iCloudSync.push('key-change')
  }
  if (useBackupState.getState().enabled) await backUpNow('key_change')
}

let _store: MMKV | null = null
// Device-local, beside the cached account: when each event was last sent.
const store = (): MMKV => (_store ??= new MMKV({ id: 'server-account' }))
const sendEvent = createKeyChangeEventGate({
  get: (key) => store().getNumber(`key-change-event:${key}`) ?? null,
  set: (key, at) => store().set(`key-change-event:${key}`, at),
  now: Date.now,
})

export const keyChange = createKeyChangeEngine({
  records: keyChangeRecords,
  now: Date.now,
  randomBytes: getRandomBytes,
  platform: Platform.OS,
  deviceKey: () => accountKey.peek(),
  isOnline: () => getOnline() !== false,
  server: {
    readAccount: fetchServerAccountInfo,
    readHistory: (key) => fetchKeyHistory(bearerOptions(key)),
    // Sent once: a 401 is checked against the account, never sent again.
    rekey: (request) =>
      rekeyAccount(request, {
        baseUrl: apis.accounts,
        authorize: (run) =>
          accountSessions.withSession(run, {
            accountKey: request.oldKey,
            retryUnauthorized: false,
          }),
        now: syncNow,
        randomBytes: getRandomBytes,
      }),
    hasSession: async () => {
      await accountSessions.ready()
      return accountSessions.snapshot() !== null
    },
    openInto,
    sealLabel: (newKey) => {
      try {
        return sealDeviceLabel(
          newKey,
          accountPubOf(newKey),
          thisDeviceLabel(),
          getRandomBytes(12)
        )
      } catch {
        return undefined
      }
    },
  },
  prepare,
  adopt: accountKey.adoptChangedKey,
  saveHistory: keyHistoryCache.save,
  step: keyChangeStep,
  track: (event, properties) => {
    if (sendEvent(event, properties.stage)) analytics.capture(event, properties)
  },
})

keyChange.onStage((stage) => useKeyChangeStatus.setState({ stage }))

/** Opens Change Account Key, to continue the change under way. */
function openToContinue(): void {
  if (navigationRef.isReady())
    navigationRef.navigate('Change Account Key', { entry: 'resume' })
}

/**
 * At launch, before anything reads the account key: a change record decides
 * which key is this device's (docs/account-key-change.md, "The record wins at
 * launch"), then a committed change carries on in the background. Never
 * throws.
 */
export function resumeKeyChangeAtLaunch(): void {
  if (!keyChangeAvailable()) return
  let resolved!: () => void
  holdAccountKeyUntil(
    new Promise<void>((resolve) => {
      resolved = resolve
    })
  )
  void keyChange
    .resume(resolved)
    .then((result) => {
      // A change the User left before it went through: tapping it opens
      // Change Account Key to continue (Settings → Account offers Continue
      // and Discard too). A top toast has no button of its own.
      if (result.state === 'awaiting')
        toast.news(i18n.t('accountKeyChange_resumeToast'), {
          message: i18n.t('accountKeyChange_resumeToastDetail'),
          onOpen: openToContinue,
        })
    })
    .catch((error: unknown) => {
      logger.warn('[keyChange] resuming failed', error)
    })
}

/** The server refused a key as retired (`retired.ts`). */
export const handleKeyRetired = createKeyRetiredHandler({
  record: keyChangeRecords.read,
  resume: () => keyChange.resume(),
  discard: () => keyChange.discard(),
  lastAccountId: serverAccount.lastAccountId,
  // As stored: the account key the rest of the app reads ignores this key.
  storedKey: BuddiesKeychain.peekRootSeed,
  isRetired: deviceAccountKey.isRetired,
  connect: async (key, accountId) => {
    await serverAccount.connect(key, { accountId })
  },
  forgetRetired: deviceAccountKey.forgetRetired,
  signOut: (accountId, changedAt) => {
    setKeyChangedElsewhere({ accountId, changedAt })
    serverAccount.forget()
  },
})

/**
 * Signed out after a change elsewhere, an Apple device may receive the new key
 * through iCloud Keychain later: it rejoins the same account without asking.
 */
async function rejoinWithSyncedKey(): Promise<void> {
  const signedOut = keyChangedElsewhere()
  // Only into the account this device knew; without one, it waits for the
  // User to sign in.
  if (!signedOut?.accountId) return
  const seed = await deviceAccountKey.peek().catch(() => null)
  if (!seed) return
  await serverAccount
    .connect(fromB64u(seed), { accountId: signedOut.accountId })
    .catch(() => undefined)
}

/** A session opened again: a sign-in after a change elsewhere is done. */
async function noteSignedIn(): Promise<void> {
  const session = accountSessions.snapshot()
  if (!session) return
  if (keyChangedElsewhere()) setKeyChangedElsewhere(null)
  // The account's history opens what older keys sealed here.
  const seed = await deviceAccountKey.peek().catch(() => null)
  if (seed)
    await keyHistoryCache
      .refresh(fromB64u(seed), session.accountId)
      .catch(() => undefined)
}

/** Step 5: the account's Cloud Sync and backup slots, under the new key. */
const resealStep = createResealStep({
  sync: (accountKey) => {
    const options = bearerOptions(accountKey)
    return {
      list: async () => (await listSyncSlots(options)).slots,
      get: (slotId) => getSyncSlot(options, slotId),
      put: async (slotId, blob, put) => {
        await putSyncSlot(options, slotId, blob, put)
      },
    }
  },
  backup: (accountKey) => {
    const options = bearerOptions(accountKey)
    return {
      list: () => listBackups(options),
      get: (slotId) => getBackupSlot(options, slotId),
      put: async (slotId, blob, put) => {
        await putBackup(options, slotId, blob, put)
      },
    }
  },
  // An install that never synced has no slot of its own.
  ownSyncSlotId: () => usePreferences.getState().iCloudDeviceId ?? null,
  // The history this device kept, else the server's; null when neither can be
  // read, so a slot only the history might open waits for a later try.
  olderKeys: async (accountId, kind, accountKey) => {
    const history =
      (await keyHistoryCache.read(accountId).catch(() => null)) ??
      (await keyHistoryCache
        .refresh(accountKey, accountId)
        .catch(() => undefined))
    return history === undefined ? null : historyKeys(history, kind)
  },
  randomBytes: getRandomBytes,
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
})

let installed = false

/**
 * Once, at launch: resolves a change in progress, and listens for retired keys
 * and sign-ins.
 */
export function installKeyChange(): void {
  if (installed || !BuddiesKeychain.isAvailable()) return
  installed = true
  registerKeyChangeStep('reseal', resealStep)
  resumeKeyChangeAtLaunch()
  void keyChange
    .current()
    .then((current) =>
      useKeyChangeStatus.setState({ stage: current?.stage ?? null })
    )
    .catch(() => undefined)
  onKeyRetired((accountPub, changedAt) => {
    void handleKeyRetired(accountPub, changedAt).catch((error: unknown) => {
      logger.warn('[keyChange] handling a retired key failed', error)
    })
  })
  // Buddies' identity came from the old key; it derives the new one next.
  onAccountKeySwitched(() => buddiesEngine.dropIdentity())
  onAccountChange((change) => {
    const signedOut = keyChangedElsewhere()
    if (change === 'session_opened' || (change === 'key_changed' && signedOut))
      void noteSignedIn()
  })
  addForegroundListener(() => {
    // A change that couldn't be resolved, or a step that stopped, tries again.
    void keyChange.resume().catch((error: unknown) => {
      logger.warn('[keyChange] resuming failed', error)
    })
    void rejoinWithSyncedKey()
  })
  void rejoinWithSyncedKey()
}
