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

export type PasskeySignInEntry = 'onboarding' | 'settings'

export type WaitingPasskey = { reason: PasskeyUnlockProblem; prf: boolean }

export type PhonePasskeyOutcome =
  | Exclude<
      PhonePasskeySignInResult,
      { status: 'unlocked' | 'cancelled' | 'failed' }
    >
  | (Extract<PhonePasskeySignInResult, { status: 'cancelled' | 'failed' }> & {
      waiting: WaitingPasskey | null
    })
  | {
      status: 'done'
      buddiesStarted: boolean

      restore: RestoreOutcome

      rejoined: boolean
    }

const PENDING_MS = 10 * 60_000

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

    confirmReplace: (loss) => confirmReplace(loss),
    wrapServer: (key) =>
      accountPasskeyDeps(key, { rpId: PASSKEY_RP_ID }).server,
    randomBytes: getRandomBytes,
    isRemovalPending: (error) => error instanceof BuddyRemovalPendingError,
    onEvent: capture,

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

export function forgetPasskeySignIn() {
  clearTimer(expiry)
  expiry = null
  flow?.forget()
}

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

export const pendingPasskeySignIn = () => flow?.pending() ?? null

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
