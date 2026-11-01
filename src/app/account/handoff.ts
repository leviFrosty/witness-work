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

export type HandoffEntry = 'settings' | 'onboarding' | 'link' | 'tools'

export type HandoffSession = OfferSession | ClaimSession

const roleName = (session: HandoffSession) =>
  session.role === 'offer' ? 'old' : 'new'

type HandoffDebugState = {
  session: HandoffSession | null
  entry: HandoffEntry | null
  startedAt: number | null

  revision: number
}

export const useHandoffDebug = create<HandoffDebugState>(() => ({
  session: null,
  entry: null,
  startedAt: null,
  revision: 0,
}))

export type HandoffEndReason =
  | 'left'
  | 'new_code'
  | 'replace_declined'
  | 'replace_failed'

const endReasons = new WeakMap<HandoffSession, HandoffEndReason>()

export function endHandoff(
  session: HandoffSession,
  reason: HandoffEndReason
): Promise<void> {
  if (!endReasons.has(session)) endReasons.set(session, reason)
  return session.cancel()
}

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
  | 'unsupported'
  | 'unavailable'
  | 'unverified'
  | 'verifyLater'
  | 'updateRequired'
  | 'offline'

function offerStartProblem(error: unknown): OfferStartProblem {
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

  if (useBackupState.getState().enabled)
    void backUpNow('handoff').catch(() => undefined)
  return { ok: true, session }
}

const ownerChecks = new WeakMap<OfferSession, 'confirmed' | 'noLock'>()

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

export function handoffHello(): HandoffHello {
  const model = Device.modelName ?? ''
  return {
    deviceName: model || (Platform.OS === 'ios' ? 'iPhone' : 'Android'),
    platform: Platform.OS === 'ios' ? 'ios' : 'android',
    model,
    appVersion: Application.nativeApplicationVersion ?? '',
  }
}

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

      restore: RestoreOutcome
    }
  | { outcome: 'declined' }
  | {
      outcome: 'failed'
      reason: HandoffFailure | 'replace_failed'

      removalPending?: BuddyRemovalPendingError

      retryable?: boolean
    }

const RETRYABLE_OPEN_FAILURES: ReadonlySet<HandoffFailure> = new Set([
  'offline',
  'server',
  'rateLimited',
  'verifyLater',
])

export async function completeClaimHandoff(
  session: ClaimSession,
  {
    confirmReplace,
    buddiesEnabled,
  }: {
    confirmReplace: (loss: AccountKeyLoss) => Promise<boolean>
    buddiesEnabled: boolean
  }
): Promise<ClaimCompletion> {
  const state = session.state
  if (state.step !== 'received')
    return { outcome: 'failed', reason: 'conflict' }
  const { accountKey: newKey, accountId } = state.received

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
    logger.warn("[handoff] couldn't check the account's other devices", error)
    await opened.close()
    await endHandoff(session, 'replace_failed')
    return { outcome: 'failed', reason: 'replace_failed' }
  }

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

    await opened.close()
  } catch (error) {
    logger.warn('[handoff] replacing the account key failed', error)
    await opened.close()
    await endHandoff(session, 'replace_failed')
    return {
      outcome: 'failed',
      reason: 'replace_failed',
      ...(error instanceof BuddyRemovalPendingError && {
        removalPending: error,
      }),
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

export async function offerRestoreAfterHandoff(): Promise<RestoreOutcome> {
  try {
    return await offerRestore('handoff')
  } catch (error) {
    logger.warn('[handoff] offering the backup failed', error)
    return { outcome: 'failed', reason: 'server' }
  }
}
