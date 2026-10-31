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
  cachedServerAccount,
  fetchServerAccountInfo,
  keyHistoryCache,
  onAccountChange,
  onAccountKeySwitched,
  onKeyRetired,
  serverAccount,
  thisDeviceLabel,
  webAccount,
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
import { historyKeys, historyPhotoKeys } from '@/lib/serverAccount/keyHistory'
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
import { webAccountKey } from '@/lib/accountKey/webAccountKey'
import { readAccountDevices } from '@/lib/serverAccount/accountDevices'
import { listPasskeys } from '@/lib/serverAccount/passkeyClient'
import {
  pageClock,
  requestContinue,
  requestStepUp,
  webStepUp,
} from '@/lib/serverAccount/stepUpPrompt'
import {
  buddiesEngine,
  carryOnBuddiesKeyChange,
  prepareBuddiesForKeyChange,
  resetBuddiesForKeyChange,
} from '@/features/buddies/lib/buddiesService'
import { navigationRef } from '@/features/contacts/lib/linking'
import i18n from '@/lib/locales'
import { toast } from '@/stores/toasts'
import { usePreferences } from '@/stores/preferences'
import { createKeyChangeEventGate } from './analytics'
import { createKeyChangeEngine, KeyChangeError } from './engine'
import {
  createPhotoResealRetry,
  createResealStep,
  type PhotosLeftStore,
  resealPhotoApi,
} from './reseal'
import { createKeyRetiredHandler } from './retired'
import { createRetiredKeyListener } from './retiredListener'
import { createSignedInNote } from './signedIn'
import { useKeyChangeStatus } from './status'
import { keyChangeStep, registerKeyChangeStep } from './steps'
import type { WebPasskeyStepUp } from '@/lib/serverAccount/webPasskeyAdd'
import { createWebKeyChange } from './web'

/**
 * Change Account Key on this device (ADR 0039), and what this device does when
 * the key changed on another one. The engine is `engine.ts`; this wires it to
 * the session, the stores and Cloud Sync and backup. The screens come later.
 */

/**
 * Whether `key` opens a session into `accountId`, asked apart from this
 * device's own session, which may be another account's: the session is closed
 * again, and the change's next step opens its own.
 */
async function openInto(
  key: Uint8Array,
  accountId: string
): Promise<'opened' | 'unknownAccount' | 'keyRetired'> {
  try {
    const opened = await accountSessions.openDetached(key, { accountId })
    await opened.close()
    return 'opened'
  } catch (error) {
    if (error instanceof AccountSessionError) {
      if (error.failure === 'keyRetired') return 'keyRetired'
      if (error.serverCode === 'unknown_account') return 'unknownAccount'
    }
    throw error
  }
}

/**
 * Step 0: what's on this device is on the server under the old key too, and
 * Buddies' inbox is linked to the account while the old key can still do it.
 */
async function prepare(change: {
  oldKey: Uint8Array
  accountId: string
}): Promise<void> {
  if (usesCloudSync() && iCloudSync.canSync()) {
    await iCloudSync.pullAndMerge('key-change')
    await iCloudSync.push('key-change')
  }
  if (useBackupState.getState().enabled) await backUpNow('key_change')
  await prepareBuddiesForKeyChange(change)
}

let _store: MMKV | null = null
// Device-local, beside the cached account: when each event was last sent.
const store = (): MMKV => (_store ??= new MMKV({ id: 'server-account' }))
/** The browser's key, for its session's calls before the change commits. */
const sessionKey = async () => {
  const key = await accountKey.peek()
  if (!key) throw new KeyChangeError('no_key')
  return bearerOptions(key)
}

/** The Web Lock a browser's tabs take to carry a key change on. */
const KEY_CHANGE_LOCK = 'ww-account-key-change'

// A browser needs a day-old session and a passkey the server checks (ADR 0039
// §2); phones check Face ID before starting.
const web =
  Platform.OS === 'web'
    ? createWebKeyChange({
        now: syncNow,
        randomBytes: getRandomBytes,
        devices: async () => {
          const key = await accountKey.peek()
          if (!key) throw new KeyChangeError('no_key')
          return readAccountDevices(key)
        },
        passkeys: async () => listPasskeys(await sessionKey()),
        canLockTabs: () =>
          typeof navigator !== 'undefined' && !!navigator.locks,
        elapsed: pageClock,
        wallNow: Date.now,
        // Which passkeys this page's RP ID has, before any key is made.
        prepare: (action) => webStepUp().prepare(action),
        // The step-up sheet: the passkey prompt runs from its own tap, which
        // Safari asks for, and it records the check (`web_step_up`) and tells
        // App Lock and Passkeys of it.
        requestStepUp,
        requestContinue,
      })
    : null

/**
 * The web, after a change: whether a passkey unlocks the account with the new
 * key (only the step-up's, when it gave PRF output). Null on phones.
 */
export const passkeyUnlocksAfterChange: (() => Promise<boolean>) | null = web
  ? () => web.passkeyUnlocks()
  : null

/**
 * The web, after a change: a new Add a Passkey's owner check, on the change's
 * own step-up while it holds, and the gate before its create. Null on phones.
 */
export const passkeyStepUpAfterChange: (() => WebPasskeyStepUp) | null = web
  ? () => web.addPasskeyStepUp()
  : null

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
  // Without the record, which the launch hold keeps until `resume` decides.
  heldKey: async () => {
    const key = await deviceAccountKey.peekStored()
    return key ? fromB64u(key) : null
  },
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
    deviceAccount: async () => {
      await accountSessions.ready()
      const session = accountSessions.snapshot()
      if (session)
        return {
          accountId: session.accountId,
          session: true,
          accountPub: session.accountPub,
        }
      const last = serverAccount.lastAccountId()
      return last ? { accountId: last, session: false } : null
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
  ...(web && { precheck: web.precheck, stepUp: web.stepUp }),
  // A browser's tabs carry a change on one at a time, and reload onto the new
  // key once it's done.
  ...(Platform.OS === 'web' &&
    typeof navigator !== 'undefined' &&
    navigator.locks && {
      exclusive: <T>(run: () => Promise<T>) =>
        navigator.locks.request(KEY_CHANGE_LOCK, run),
    }),
  ...(webAccount && { finished: () => webAccount?.rekeyed() }),
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
  lose: () => keyChange.lose(),
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
  accountPub: () =>
    cachedServerAccount()?.accountPub ??
    accountSessions.snapshot()?.accountPub ??
    null,
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

/** A session opened again (`signedIn.ts`). */
const noteSignedIn = createSignedInNote({
  sessionAccountId: () => accountSessions.snapshot()?.accountId ?? null,
  signedOutElsewhere: () => keyChangedElsewhere() !== null,
  clearSignedOut: () => setKeyChangedElsewhere(null),
  resume: () => keyChange.resume(),
  storedKey: async () => {
    const seed = await deviceAccountKey.peek()
    return seed ? fromB64u(seed) : null
  },
  refreshHistory: (key, accountId) => keyHistoryCache.refresh(key, accountId),
  warn: (message, error) => logger.warn(message, error),
})

/**
 * The history this device kept, else the server's; undefined when neither can
 * be read.
 */
const readHistory = async (accountId: string, accountKey: Uint8Array) =>
  (await keyHistoryCache.read(accountId).catch(() => null)) ??
  (await keyHistoryCache.refresh(accountKey, accountId).catch(() => undefined))

// An install that never synced has no slot of its own.
const ownSyncSlotId = () => usePreferences.getState().iCloudDeviceId ?? null

const PHOTOS_LEFT = 'key-change-photos-left'
const photosLeft: PhotosLeftStore = {
  get: () => store().getString(PHOTOS_LEFT) ?? null,
  set: (accountId) => {
    if (accountId) store().set(PHOTOS_LEFT, accountId)
    else store().delete(PHOTOS_LEFT)
  },
}

const photoDeps = {
  photos: (accountKey: Uint8Array) =>
    resealPhotoApi(bearerOptions(accountKey), ownSyncSlotId),
  olderPhotoKeys: async (accountId: string, accountKey: Uint8Array) => {
    const history = await readHistory(accountId, accountKey)
    return history === undefined
      ? null
      : historyPhotoKeys(history).map(({ name, photo }) => ({
          nameKey: name,
          photoKey: photo,
        }))
  },
  photosLeft,
  randomBytes: getRandomBytes,
  // Between chunks of a photo: a frame can render.
  pause: () => new Promise<void>((resolve) => setTimeout(resolve, 0)),
}

/**
 * Step 5: the account's Cloud Sync slots and photos, and its backup slots,
 * under the new key.
 */
const resealStep = createResealStep({
  ...photoDeps,
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
  ownSyncSlotId,
  // Null when the history can't be read, so a slot only it might open waits
  // for a later try.
  olderKeys: async (accountId, kind, accountKey) => {
    const history = await readHistory(accountId, accountKey)
    return history === undefined ? null : historyKeys(history, kind)
  },
  randomBytes: getRandomBytes,
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
})

// Photos a change left under an older key move to this key's names: once a
// launch, with a session open and no change under way (`reseal.ts`).
const retryPhotoReseal = createPhotoResealRetry({
  ...photoDeps,
  sessionAccountId: () => accountSessions.snapshot()?.accountId ?? null,
  changeUnderWay: async () =>
    (await keyChange.current().catch(() => null)) !== null,
  accountKey: async () => {
    const seed = await deviceAccountKey.peek().catch(() => null)
    return seed ? fromB64u(seed) : null
  },
})

/** `retryPhotoReseal`, never throwing. */
function retryPhotosLeft(): void {
  void retryPhotoReseal().catch((error: unknown) => {
    logger.warn(
      '[keyChange] moving photos left under an older key failed',
      error
    )
  })
}

let installed = false
let waitingForKey = false

/** Before anything waits for a key (`retiredListener.ts`). */
const listenForRetiredKeys = createRetiredKeyListener({
  onKeyRetired,
  handle: handleKeyRetired,
  warn: (message, error) => logger.warn(message, error),
})

/**
 * Once, at launch: resolves a change in progress, and listens for retired keys
 * and sign-ins. A browser signed out has no key yet: it installs when one
 * arrives with a sign-in.
 */
export function installKeyChange(): void {
  listenForRetiredKeys()
  if (installed) return
  if (!BuddiesKeychain.isAvailable()) {
    if (Platform.OS === 'web' && !waitingForKey) {
      waitingForKey = true
      const stop = webAccountKey.subscribe(() => {
        if (!BuddiesKeychain.isAvailable()) return
        stop()
        installKeyChange()
      })
    }
    return
  }
  installed = true
  registerKeyChangeStep('reseal', resealStep)
  // Step 6 (Buddies' reconnect invites); it resolves once the old inbox is
  // gone, and Buddies leaves the rest as they reconnect.
  registerKeyChangeStep('buddies-reset', async (step) => {
    await resetBuddiesForKeyChange(step)
  })
  resumeKeyChangeAtLaunch()
  void keyChange
    .current()
    .then((current) =>
      useKeyChangeStatus.setState({ stage: current?.stage ?? null })
    )
    .catch(() => undefined)
  // Leaving the old pairings goes on after the step, whether or not Buddies
  // is running.
  carryOnBuddiesKeyChange()
  // Buddies' identity came from the old key; it derives the new one next.
  onAccountKeySwitched(() => buddiesEngine.dropIdentity())
  onAccountChange((change) => {
    const signedOut = keyChangedElsewhere()
    if (change === 'session_opened' || (change === 'key_changed' && signedOut))
      void noteSignedIn()
    if (change === 'session_opened') retryPhotosLeft()
  })
  addForegroundListener(() => {
    // A change that couldn't be resolved, or a step that stopped, tries again.
    void keyChange.resume().catch((error: unknown) => {
      logger.warn('[keyChange] resuming failed', error)
    })
    carryOnBuddiesKeyChange()
    void rejoinWithSyncedKey()
    retryPhotosLeft()
  })
  void rejoinWithSyncedKey()
  retryPhotosLeft()
}
