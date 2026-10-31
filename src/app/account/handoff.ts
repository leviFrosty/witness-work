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
import type { DeviceOwnerCheck } from '@/lib/deviceOwner'
import { logger } from '@/lib/logger'
import { accountSessions, serverAccount } from '@/lib/serverAccount'
import { useBackupState } from '@/lib/serverAccount/backupStore'
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
import {
  type DetachedSession,
  toAccountSessionError,
} from '@/lib/serverAccount/session'
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
    const before = previous
    previous = state.step
    if (quiet) return
    // An Allow that didn't get through goes back to `confirm`: not a new claim.
    if (
      (session.role === 'offer' &&
        state.step === 'confirm' &&
        before === 'waiting') ||
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
  /** This device couldn't prove it's WitnessWork. */
  | 'unverified'
  /** Verifying this device failed for now (Apple or Google, or the server). */
  | 'verifyLater'
  /** The server needs a newer app. */
  | 'updateRequired'
  /** The account couldn't be reached: offline or the server failed. */
  | 'offline'

/**
 * Why the account's session couldn't be opened, for the phone with the account
 * (Set Up Another Device, or approving a browser).
 */
export function offerStartProblem(error: unknown): OfferStartProblem {
  const failure = toAccountSessionError(error)
  switch (failure.failure) {
    case 'unavailable':
      return 'unavailable'
    case 'attestation':
      return failure.attestation === 'temporary' ? 'verifyLater' : 'unverified'
    case 'upgrade':
      return 'updateRequired'
  }
  return 'offline'
}

/**
 * The old phone: makes sure the account key exists and the account's session is
 * open (registering the account the first time), then opens a channel. Resolves
 * the session (opening) or why it can't start.
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
  let accountId: string
  try {
    accountId = (await serverAccount.connect(key)).accountId
  } catch (error) {
    const problem = offerStartProblem(error)
    if (!quiet)
      analytics.capture('handoff_failed', { role: 'old', reason: problem })
    return { ok: false, problem }
  }
  const session = createOfferSession(
    {
      accountKey: key,
      accountId,
      authorize: (run) => accountSessions.withSession(run, { accountKey: key }),
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

/** Offers whose Allow the device's owner already confirmed, and how. */
const ownerChecks = new WeakMap<OfferSession, 'confirmed' | 'noLock'>()

/**
 * Allow: sends the account key to the new phone once the device's owner
 * confirms it (Face ID, Touch ID, fingerprint, passcode or screen lock), so
 * someone holding the unlocked phone can't sign their own phone in. Tapping
 * Allow again after a send that didn't get through doesn't ask again.
 */
export async function approveHandoff(
  session: OfferSession,
  { confirmOwner }: { confirmOwner: () => Promise<DeviceOwnerCheck> }
): Promise<'sent' | 'cancelled' | 'failed'> {
  let owner = ownerChecks.get(session)
  if (!owner) {
    const check = await confirmOwner().catch((error: unknown) => {
      logger.warn("[handoff] couldn't confirm the device's owner", error)
      return 'failed' as const
    })
    if (check === 'cancelled' || check === 'failed') {
      analytics.capture('handoff_answered', { answer: 'allow', auth: check })
      return check
    }
    owner = check
    ownerChecks.set(session, owner)
  }
  analytics.capture('handoff_answered', {
    answer: 'allow',
    auth: owner === 'confirmed' ? 'device' : 'none',
  })
  await session.approve()
  return 'sent'
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
      /**
       * Opening the account's session failed for now: the key is still here and
       * the channel open, so `completeClaimHandoff` can run again.
       */
      retryable?: boolean
    }

/**
 * Failures opening the session with the received key that pass by themselves.
 * The key is already on this phone, so the User tries again instead of making a
 * new code on the other phone.
 */
const RETRYABLE_OPEN_FAILURES: ReadonlySet<HandoffFailure> = new Set([
  'offline',
  'server',
  'rateLimited',
  'verifyLater',
])

/**
 * The new phone, once the key arrived: opens a session with the key (attesting
 * this phone) and checks it's the account the key came with (a connection
 * dropped while it opens leaves the session `received` to try again), warns
 * when replacing this phone's key loses Buddies data (`confirmReplace`),
 * replaces it and keeps that session, tells the old phone it's done, and starts
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

  // The key must be the account's: the same accountPub always opens a session
  // for the same accountId.
  let opened: DetachedSession
  try {
    opened = await accountSessions.openDetached(newKey)
  } catch (error) {
    const reason = handoffFailureFor(error, 'session/open')
    if (RETRYABLE_OPEN_FAILURES.has(reason))
      return { outcome: 'failed', reason, retryable: true }
    session.fail(reason)
    return { outcome: 'failed', reason }
  }
  if (opened.accountId !== accountId) {
    await opened.close()
    session.fail('tampered')
    return { outcome: 'failed', reason: 'tampered' }
  }

  const current = await accountKey.peek()
  const differs =
    current !== null &&
    (current.length !== newKey.length ||
      current.some((byte, i) => byte !== newKey[i]))
  let loss: AccountKeyLoss
  try {
    loss = await accountKey.lossIfReplaced(newKey)
  } catch (error) {
    // Whether the account's other devices keep its buddies decides what this
    // phone deletes; nothing is, without knowing.
    logger.warn("[handoff] couldn't check the account's other devices", error)
    await opened.close()
    await endHandoff(session, 'replace_failed')
    return { outcome: 'failed', reason: 'replace_failed' }
  }
  // On iOS the key reaches every Apple device on the same iCloud Keychain,
  // so replacing one there always asks, as with a recovery key.
  if (
    differs &&
    (losesSomething(loss) || Platform.OS === 'ios') &&
    !(await confirmReplace(loss))
  ) {
    await opened.close()
    await endHandoff(session, 'replace_declined')
    return { outcome: 'declined' }
  }

  try {
    const result = await replaceAccountKey(newKey, {
      source: 'handoff',
      confirmedLoss: true,
      session: opened,
    })
    if (result.outcome === 'replaced' && result.accountId !== accountId)
      logger.warn('[handoff] the new account opened under another id')
    // Already this phone's key, with its own session: the extra one ends.
    await opened.close()
  } catch (error) {
    logger.warn('[handoff] replacing the account key failed', error)
    await opened.close()
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
