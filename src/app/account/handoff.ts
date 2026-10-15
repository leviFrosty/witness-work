import { Platform } from 'react-native'
import * as Application from 'expo-application'
import { getRandomBytes } from 'expo-crypto'
import * as Device from 'expo-device'
import { create } from 'zustand'
import apis from '@/constants/apis'
import {
  accountKey,
  accountKeyAvailable,
  replaceAccountKey,
} from '@/app/account/accountKey'
import { backUpNow } from '@/app/account/backup'
import { offerRestore, type RestoreOutcome } from '@/app/account/backupRestore'
import { joinBuddiesHere } from '@/app/buddies/joinBuddiesHere'
import {
  type AccountKeyLoss,
  losesSomething,
} from '@/lib/accountKey/accountKey'
import { analytics } from '@/lib/analytics'
import { logger } from '@/lib/logger'
import { serverAccount } from '@/lib/serverAccount'
import { useBackupState } from '@/lib/serverAccount/backupStore'
import { registerAccount } from '@/lib/serverAccount/client'
import type { HandoffHello, HandoffOffer } from '@/lib/serverAccount/handoff'
import {
  type ClaimSession,
  createClaimSession,
  createOfferSession,
  type HandoffEvent,
  type HandoffFailure,
  handoffFailureFor,
  type OfferSession,
} from '@/lib/serverAccount/handoffSession'
import { deriveAccountSigningKey } from '@/lib/serverAccount/keys'
import { syncNow } from '@/lib/syncClock'
import { BuddyRemovalPendingError } from '@/features/buddies/lib/engine'

/**
 * Set Up Another Device (ADR 0026) for this app: both phones' sessions wired to
 * the account key, the server account, Buddies, and analytics. The screens
 * drive a session; the developer Tools read the latest one from
 * `useHandoffDebug`.
 */

/** Where the User started it. */
export type HandoffEntry = 'settings' | 'onboarding' | 'link' | 'tools'

export type HandoffSession = OfferSession | ClaimSession

/** Analytics' name for a side: the phone with the account, or the new one. */
const roleName = (session: HandoffSession) =>
  session.role === 'offer' ? 'old' : 'new'

type HandoffDebugState = {
  /** The current or last session, for Tools. */
  session: HandoffSession | null
  entry: HandoffEntry | null
  startedAt: number | null
  /** Bumped on every change of the session, so Tools re-render. */
  revision: number
}

export const useHandoffDebug = create<HandoffDebugState>(() => ({
  session: null,
  entry: null,
  startedAt: null,
  revision: 0,
}))

/** Why the app ended a handoff itself, for `handoff_failed`. */
export type HandoffEndReason =
  /** The User left the screen. */
  | 'left'
  /** The old phone made a new code. */
  | 'new_code'
  /** The new phone's User declined the replacement warning. */
  | 'replace_declined'
  /** Replacing the account key failed. */
  | 'replace_failed'

const endReasons = new WeakMap<HandoffSession, HandoffEndReason>()

/** Ends a session the User walked away from, telling the server. */
export function endHandoff(
  session: HandoffSession,
  reason: HandoffEndReason
): Promise<void> {
  if (!endReasons.has(session)) endReasons.set(session, reason)
  return session.cancel()
}

/** Records the session for Tools and reports its milestones. */
function track(
  session: HandoffSession,
  entry: HandoffEntry,
  { quiet }: { quiet: boolean }
) {
  useHandoffDebug.setState({
    session,
    entry,
    startedAt: Date.now(),
    revision: useHandoffDebug.getState().revision + 1,
  })
  const role = roleName(session)
  if (!quiet) analytics.capture('handoff_started', { role, entry })
  let previous = session.state.step
  session.subscribe(() => {
    if (useHandoffDebug.getState().session === session)
      useHandoffDebug.setState((state) => ({ revision: state.revision + 1 }))
    const state = session.state
    if (state.step === previous) return
    previous = state.step
    if (quiet) return
    if (
      (session.role === 'offer' && state.step === 'confirm') ||
      (session.role === 'claim' && state.step === 'waiting')
    )
      analytics.capture('handoff_claimed', { role })
    else if (state.step === 'done')
      analytics.capture('handoff_completed', { role })
    else if (state.step === 'failed')
      analytics.capture('handoff_failed', { role, reason: state.reason })
    else if (state.step === 'declined')
      analytics.capture('handoff_answered', { answer: 'decline' })
    else if (state.step === 'cancelled')
      analytics.capture('handoff_failed', {
        role,
        reason: endReasons.get(session) ?? 'left',
      })
  })
}

const sessionDeps = () => ({
  baseUrl: apis.accounts,
  now: syncNow,
  randomBytes: getRandomBytes,
  onEvent: (event: HandoffEvent) => {
    if (event.outcome !== 'ok')
      logger.debug(`[handoff] ${event.op}: ${event.outcome}`)
  },
})

export type OfferStartProblem =
  /** This binary can't keep an account key. */
  | 'unsupported'
  /** Accounts are off on the server. */
  | 'unavailable'
  /** The account couldn't be registered: offline or the server failed. */
  | 'offline'

/**
 * The old phone: makes sure the account key exists and the account is
 * registered, then opens a channel. Resolves the session (opening) or why it
 * can't start.
 */
export async function startOfferHandoff(
  entry: HandoffEntry,
  { quiet = false }: { quiet?: boolean } = {}
): Promise<
  | { ok: true; session: OfferSession }
  | { ok: false; problem: OfferStartProblem }
> {
  if (!accountKeyAvailable()) return { ok: false, problem: 'unsupported' }
  const key = await accountKey.getOrCreate()
  const account = await serverAccount.ensure(key)
  if (!account) {
    const cached = serverAccount.cached(key)
    const off =
      !cached?.accountId && (cached?.unavailableUntil ?? 0) > Date.now()
    if (!quiet)
      analytics.capture('handoff_failed', {
        role: 'old',
        reason: off ? 'unavailable' : 'offline',
      })
    return { ok: false, problem: off ? 'unavailable' : 'offline' }
  }
  const session = createOfferSession(
    {
      accountKey: key,
      accountId: account.accountId,
      signingKey: deriveAccountSigningKey(key),
    },
    sessionDeps()
  )
  track(session, entry, { quiet })
  void session.open()
  // The new phone offers the backup as soon as it has the key, so bring it up
  // to date while the User scans and compares codes.
  if (useBackupState.getState().enabled)
    void backUpNow('handoff').catch(() => undefined)
  return { ok: true, session }
}

/** Allow: sends the account key to the new phone. */
export function approveHandoff(session: OfferSession): Promise<void> {
  analytics.capture('handoff_answered', { answer: 'allow' })
  return session.approve()
}

/** What the new phone tells the old one about itself. */
export function handoffHello(): HandoffHello {
  const model = Device.modelName ?? ''
  return {
    deviceName: model || (Platform.OS === 'ios' ? 'iPhone' : 'Android'),
    platform: Platform.OS === 'ios' ? 'ios' : 'android',
    model,
    appVersion: Application.nativeApplicationVersion ?? '',
  }
}

/** The new phone: claims the channel a scanned or opened link names. */
export function startClaimHandoff(
  offer: HandoffOffer,
  entry: HandoffEntry,
  { quiet = false }: { quiet?: boolean } = {}
): ClaimSession {
  const session = createClaimSession(offer, handoffHello(), sessionDeps())
  track(session, entry, { quiet })
  void session.claim()
  return session
}

export type ClaimCompletion =
  | {
      outcome: 'done'
      buddiesStarted: boolean
      /** What came of offering the account's backup. */
      restore: RestoreOutcome
    }
  /** The User declined the replacement warning; the channel is cancelled. */
  | { outcome: 'declined' }
  | {
      outcome: 'failed'
      reason: HandoffFailure | 'replace_failed'
      /** Delete Buddies is still waiting to tell a buddy. */
      removalPending?: boolean
    }

/**
 * The new phone, once the key arrived: checks the key registers as the account
 * it came with, warns when replacing this phone's key loses Buddies data
 * (`confirmReplace`), replaces it, tells the old phone it's done, and starts
 * Buddies when the account uses it.
 */
export async function completeClaimHandoff(
  session: ClaimSession,
  {
    confirmReplace,
    buddiesEnabled,
  }: {
    /** Resolves whether to go ahead; shown only when something is lost. */
    confirmReplace: (loss: AccountKeyLoss) => Promise<boolean>
    buddiesEnabled: boolean
  }
): Promise<ClaimCompletion> {
  const state = session.state
  if (state.step !== 'received')
    return { outcome: 'failed', reason: 'conflict' }
  const { accountKey: newKey, accountId } = state.received

  // The key must be the account's: the same accountPub always registers as
  // the same accountId.
  try {
    const registered = await registerAccount({
      baseUrl: apis.accounts,
      key: deriveAccountSigningKey(newKey),
      now: syncNow,
      randomBytes: getRandomBytes,
    })
    if (registered.accountId !== accountId) {
      session.fail('tampered')
      return { outcome: 'failed', reason: 'tampered' }
    }
  } catch (error) {
    const reason = handoffFailureFor(error, 'account/register')
    session.fail(reason)
    return { outcome: 'failed', reason }
  }

  const current = await accountKey.peek()
  const differs =
    current !== null &&
    (current.length !== newKey.length ||
      current.some((byte, i) => byte !== newKey[i]))
  const loss = await accountKey.lossIfReplaced(newKey)
  // On iOS the key reaches every Apple device on the same iCloud Keychain,
  // so replacing one there always asks, as with a recovery key.
  if (
    differs &&
    (losesSomething(loss) || Platform.OS === 'ios') &&
    !(await confirmReplace(loss))
  ) {
    await endHandoff(session, 'replace_declined')
    return { outcome: 'declined' }
  }

  try {
    const result = await replaceAccountKey(newKey, {
      source: 'handoff',
      confirmedLoss: true,
    })
    if (result.outcome === 'replaced' && result.accountId !== accountId)
      logger.warn('[handoff] the new account registered under another id')
  } catch (error) {
    logger.warn('[handoff] replacing the account key failed', error)
    await endHandoff(session, 'replace_failed')
    return {
      outcome: 'failed',
      reason: 'replace_failed',
      removalPending: error instanceof BuddyRemovalPendingError,
    }
  }

  await session.finish()
  const buddiesStarted = buddiesEnabled
    ? await joinBuddiesHere('handoff').catch((error: unknown) => {
        logger.warn('[handoff] starting Buddies failed', error)
        return false
      })
    : false
  const restore = await offerRestoreAfterHandoff()
  return { outcome: 'done', buddiesStarted, restore }
}

/**
 * The account's backup, offered on the phone that just received the account key
 * (ADR 0026 §4): Restore or Not Now, or Replace, Combine or Not Now when this
 * phone already has records. Never fails the handoff.
 */
export async function offerRestoreAfterHandoff(): Promise<RestoreOutcome> {
  try {
    return await offerRestore('handoff')
  } catch (error) {
    logger.warn('[handoff] offering the backup failed', error)
    return { outcome: 'failed', reason: 'server' }
  }
}
