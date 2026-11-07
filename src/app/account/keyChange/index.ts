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

const store = (): MMKV => (_store ??= new MMKV({ id: 'server-account' }))

const sessionKey = async () => {
  const key = await accountKey.peek()
  if (!key) throw new KeyChangeError('no_key')
  return bearerOptions(key)
}

const KEY_CHANGE_LOCK = 'ww-account-key-change'

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

        prepare: (action) => webStepUp().prepare(action),

        requestStepUp,
        requestContinue,
      })
    : null

export const passkeyUnlocksAfterChange: (() => Promise<boolean>) | null = web
  ? () => web.passkeyUnlocks()
  : null

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

  heldKey: async () => {
    const key = await deviceAccountKey.peekStored()
    return key ? fromB64u(key) : null
  },
  isOnline: () => getOnline() !== false,
  server: {
    readAccount: fetchServerAccountInfo,
    readHistory: (key) => fetchKeyHistory(bearerOptions(key)),

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

function openToContinue(): void {
  if (navigationRef.isReady())
    navigationRef.navigate('Change Account Key', { entry: 'resume' })
}

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

export const handleKeyRetired = createKeyRetiredHandler({
  record: keyChangeRecords.read,
  resume: () => keyChange.resume(),
  discard: () => keyChange.discard(),
  lose: () => keyChange.lose(),
  lastAccountId: serverAccount.lastAccountId,

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

async function rejoinWithSyncedKey(): Promise<void> {
  const signedOut = keyChangedElsewhere()

  if (!signedOut?.accountId) return
  const seed = await deviceAccountKey.peek().catch(() => null)
  if (!seed) return
  await serverAccount
    .connect(fromB64u(seed), { accountId: signedOut.accountId })
    .catch(() => undefined)
}

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

const readHistory = async (accountId: string, accountKey: Uint8Array) =>
  (await keyHistoryCache.read(accountId).catch(() => null)) ??
  (await keyHistoryCache.refresh(accountKey, accountId).catch(() => undefined))

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

  pause: () => new Promise<void>((resolve) => setTimeout(resolve, 0)),
}

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

  olderKeys: async (accountId, kind, accountKey) => {
    const history = await readHistory(accountId, accountKey)
    return history === undefined ? null : historyKeys(history, kind)
  },
  randomBytes: getRandomBytes,
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
})

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

const listenForRetiredKeys = createRetiredKeyListener({
  onKeyRetired,
  handle: handleKeyRetired,
  warn: (message, error) => logger.warn(message, error),
})

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

  carryOnBuddiesKeyChange()

  onAccountKeySwitched(() => buddiesEngine.dropIdentity())
  onAccountChange((change) => {
    const signedOut = keyChangedElsewhere()
    if (change === 'session_opened' || (change === 'key_changed' && signedOut))
      void noteSignedIn()
    if (change === 'session_opened') retryPhotosLeft()
  })
  addForegroundListener(() => {
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
