import { Platform } from 'react-native'
import { getRandomBytes } from 'expo-crypto'
import apis from '@/constants/apis'
import { accountKey, replaceAccountKey } from '@/app/account/accountKey'
import { offerRestore, type RestoreOutcome } from '@/app/account/backupRestore'
import { phonePasskeyGet } from '@/app/account/passkeys'
import { joinBuddiesHere } from '@/app/buddies/joinBuddiesHere'
import type { AccountKeyLoss } from '@/lib/accountKey/accountKey'
import { analytics } from '@/lib/analytics'
import i18n from '@/lib/locales'
import { logger } from '@/lib/logger'
import { PASSKEY_RP_ID } from '@/lib/passkeys/rpId'
import { accountSessions, serverAccount } from '@/lib/serverAccount'
import {
  finishPasskeySignIn,
  startPasskeySignIn,
} from '@/lib/serverAccount/passkeyClient'
import { accountPasskeyDeps } from '@/lib/serverAccount/passkeyServer'
import {
  createPhonePasskeySignIn,
  type PendingWrapOutcome,
  type PhonePasskeySignIn,
  type PhonePasskeySignInEvent,
  type PhonePasskeySignInResult,
} from '@/lib/serverAccount/phonePasskeySignIn'
import type { PasskeyUnlockProblem } from '@/lib/serverAccount/passkeys'
import { toast } from '@/stores/toasts'
import { BuddyRemovalPendingError } from '@/features/buddies/lib/engine'

/**
 * Sign In with a Passkey on a new phone (ADR 0038 §6): the flow in
 * `phonePasskeySignIn`, wired to the native passkey sheet, this phone's
 * attested sessions, the account key, Buddies, the account's backup, and
 * analytics.
 *
 * A passkey that signed in but can't unlock waits in memory while a sign-in
 * screen holds it (`holdPasskeySignIn`), and at most 10 minutes. Trying another
 * passkey keeps it until that one unlocks or can't. The other phone's QR code
 * and the recovery key call `passkeyKeyArrived` once their key is this phone's,
 * which saves the passkey's wrap so it unlocks next time.
 */

/** Where the User chose Sign In with a Passkey. */
export type PasskeySignInEntry = 'onboarding' | 'settings'

/** The passkey that signed in but can't unlock, while it waits. */
export type WaitingPasskey = { reason: PasskeyUnlockProblem; prf: boolean }

export type PhonePasskeyOutcome =
  | Exclude<
      PhonePasskeySignInResult,
      { status: 'unlocked' | 'cancelled' | 'failed' }
    >
  /** `waiting`: a passkey from before still waits for the key. */
  | (Extract<PhonePasskeySignInResult, { status: 'cancelled' | 'failed' }> & {
      waiting: WaitingPasskey | null
    })
  | {
      status: 'done'
      buddiesStarted: boolean
      /** What came of offering the account's backup. */
      restore: RestoreOutcome
      /**
       * Back on the account this phone was on, under a changed key: its records
       * stay as they are, so no backup was offered.
       */
      rejoined: boolean
    }

/** How long a passkey that couldn't unlock waits for the key. */
const PENDING_MS = 10 * 60_000
/** Moving between sign-in screens lets go for a moment. */
const RELEASE_GRACE_MS = 2_000

let entry: PasskeySignInEntry = 'settings'
const platform = () => (Platform.OS === 'ios' ? 'ios' : 'android')

function capture(event: PhonePasskeySignInEvent) {
  const base = { platform: platform(), entry }
  switch (event.type) {
    case 'started':
      return analytics.capture('passkey_sign_in_started', base)
    case 'succeeded':
      return analytics.capture('passkey_sign_in_succeeded', {
        ...base,
        unlocked: event.unlocked,
        ...(!event.unlocked && {
          cant_unlock: event.reason,
          prf: event.prf,
        }),
      })
    case 'failed':
      return analytics.capture('passkey_sign_in_failed', {
        ...base,
        reason: event.reason,
        ...(event.serverReason && { server_reason: event.serverReason }),
      })
    case 'wrap':
      return analytics.capture('passkey_sign_in_wrap', {
        ...base,
        outcome: event.outcome,
      })
  }
}

let flow: PhonePasskeySignIn | null = null

function phoneFlow(): PhonePasskeySignIn {
  flow ??= createPhonePasskeySignIn({
    passkeys: {
      challenge: () =>
        startPasskeySignIn({ rpId: PASSKEY_RP_ID }, { baseUrl: apis.accounts }),
      get: phonePasskeyGet,
      assert: (args) => finishPasskeySignIn(args, { baseUrl: apis.accounts }),
    },
    account: {
      openDetached: (key, call) => accountSessions.openDetached(key, call),
      current: () => accountKey.peek(),
      lastAccountId: () => serverAccount.lastAccountId(),
      lossIfReplaced: (key, call) => accountKey.lossIfReplaced(key, call),
      replace: (key, session, accountId) =>
        replaceAccountKey(key, {
          source: 'passkey',
          confirmedLoss: true,
          session,
          accountId,
        }),
    },
    // Asked before any other account's key replaces this phone's, on both
    // platforms (see `phonePasskeySignIn`).
    confirmReplace: (loss) => confirmReplace(loss),
    wrapServer: (key) =>
      accountPasskeyDeps(key, { rpId: PASSKEY_RP_ID }).server,
    randomBytes: getRandomBytes,
    isRemovalPending: (error) => error instanceof BuddyRemovalPendingError,
    onEvent: capture,
    // PasskeyError carries the platform's message; never secrets.
    onError: (step, error) =>
      logger.warn(`[passkeys] sign-in ${step} failed`, error),
  })
  return flow
}

let confirmReplace: (loss: AccountKeyLoss) => Promise<boolean> = async () =>
  false

let expiry: ReturnType<typeof setTimeout> | null = null
let release: ReturnType<typeof setTimeout> | null = null
let holders = 0

function clearTimer(timer: ReturnType<typeof setTimeout> | null) {
  if (timer) clearTimeout(timer)
}

/** Forgets a passkey that couldn't unlock, its PRF output zeroed. */
export function forgetPasskeySignIn() {
  clearTimer(expiry)
  expiry = null
  flow?.forget()
}

/**
 * A sign-in screen keeps the passkey that couldn't unlock while it shows.
 * Returns the release; once nothing holds it, it's forgotten.
 */
export function holdPasskeySignIn(): () => void {
  holders++
  clearTimer(release)
  release = null
  let released = false
  return () => {
    if (released) return
    released = true
    holders--
    if (holders > 0) return
    clearTimer(release)
    release = setTimeout(() => {
      release = null
      if (holders === 0) forgetPasskeySignIn()
    }, RELEASE_GRACE_MS)
  }
}

/** The passkey that signed in but can't unlock, while it waits. */
export const pendingPasskeySignIn = () => flow?.pending() ?? null

/**
 * Sign In with a Passkey, start to end: the sheet, the server, the replace-key
 * warning, the key, then Buddies and the account's backup, as a handoff's new
 * phone does.
 */
export async function signInWithPhonePasskey(options: {
  entry: PasskeySignInEntry
  confirmReplace: (loss: AccountKeyLoss) => Promise<boolean>
  buddiesEnabled: boolean
}): Promise<PhonePasskeyOutcome> {
  entry = options.entry
  confirmReplace = options.confirmReplace
  const flow = phoneFlow()
  const result = await flow.signIn()
  if (result.status === 'cancelled' || result.status === 'failed')
    // A passkey from before keeps waiting, with its own expiry.
    return { ...result, waiting: flow.pending() }
  clearTimer(expiry)
  expiry = null
  if (result.status === 'cantUnlock') {
    expiry = setTimeout(forgetPasskeySignIn, PENDING_MS)
    return result
  }
  if (result.status !== 'unlocked') return result
  const buddiesStarted = options.buddiesEnabled
    ? await joinBuddiesHere('passkey').catch((error: unknown) => {
        logger.warn('[passkeys] starting Buddies failed', error)
        return false
      })
    : false
  // Back on its own account, this phone's records carry on as they are, as
  // after a handoff's rejoin.
  let restore: RestoreOutcome = { outcome: 'skipped' }
  if (!result.rejoined)
    try {
      restore = await offerRestore('passkey')
    } catch (error) {
      logger.warn('[passkeys] offering the backup failed', error)
      restore = { outcome: 'failed', reason: 'server' }
    }
  return { status: 'done', buddiesStarted, restore, rejoined: result.rejoined }
}

/**
 * The key reached this phone another way (the other phone's QR code, or the
 * recovery key) and its session is open: a passkey that signed in but couldn't
 * unlock saves its wrap now, so it unlocks next time. Never throws.
 */
export async function passkeyKeyArrived(
  key: Uint8Array
): Promise<PendingWrapOutcome | null> {
  if (!flow?.pending()) return null
  clearTimer(expiry)
  expiry = null
  const outcome = await flow.keyArrived(key).catch(() => null)
  if (outcome === 'saved') toast.success(i18n.t('passkeySignIn_unlocksNow'))
  return outcome
}
