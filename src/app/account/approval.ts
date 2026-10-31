import { getRandomBytes } from 'expo-crypto'
import { create } from 'zustand'
import apis from '@/constants/apis'
import { accountKey, accountKeyAvailable } from '@/app/account/accountKey'
import {
  handoffHello,
  offerStartProblem,
  type OfferStartProblem,
} from '@/app/account/handoff'
import { analytics } from '@/lib/analytics'
import type { DeviceOwnerCheck } from '@/lib/deviceOwner'
import { logger } from '@/lib/logger'
import { accountSessions, serverAccount } from '@/lib/serverAccount'
import { appApprovalOrigins } from '@/lib/serverAccount/approvalRuntime'
import {
  type ApprovalEvent,
  createPhoneApproval,
  type PhoneApproval,
} from '@/lib/serverAccount/approvalSession'
import { syncNow } from '@/lib/syncClock'

/**
 * Sign In on a Computer (ADR 0038, docs/passkeys-protocol.md "Approving a
 * browser from a phone") for this app: the phone's side wired to the account
 * key, its session, the device-owner check, and analytics. The screen drives
 * the session; the developer Tools read the latest one from
 * `useApprovalDebug`.
 */

/** Where the User started it. */
export type ApprovalEntry = 'settings' | 'tools'

type ApprovalDebugState = {
  /** The current or last approval, for Tools. */
  session: PhoneApproval | null
  entry: ApprovalEntry | null
  /** Bumped on every change of the session, so Tools re-render. */
  revision: number
}

export const useApprovalDebug = create<ApprovalDebugState>(() => ({
  session: null,
  entry: null,
  revision: 0,
}))

/** How the device's owner confirmed a YES, for `approval_approved`. */
const ownerChecks = new WeakMap<PhoneApproval, 'confirmed' | 'noLock'>()

/** Records the session for Tools and reports its milestones. */
function track(session: PhoneApproval, entry: ApprovalEntry) {
  useApprovalDebug.setState((state) => ({
    session,
    entry,
    revision: state.revision + 1,
  }))
  if (session.state.step === 'invalid')
    analytics.capture('approval_failed', { reason: session.state.problem })
  let previous = session.state.step
  session.subscribe(() => {
    if (useApprovalDebug.getState().session === session)
      useApprovalDebug.setState((state) => ({ revision: state.revision + 1 }))
    const state = session.state
    if (state.step === previous) return
    const before = previous
    previous = state.step
    // A YES that didn't get through goes back to `confirm`: not a new claim.
    if (state.step === 'confirm' && before === 'claiming')
      analytics.capture('approval_claimed', { far: state.far })
    else if (state.step === 'done')
      analytics.capture('approval_approved', {
        auth: ownerChecks.get(session) === 'confirmed' ? 'device' : 'none',
      })
    else if (state.step === 'declined')
      analytics.capture('approval_declined', {})
    else if (state.step === 'failed')
      analytics.capture('approval_failed', { reason: state.reason })
    else if (state.step === 'cancelled')
      analytics.capture('approval_failed', { reason: 'left' })
  })
}

const sessionDeps = () => ({
  baseUrl: apis.accounts,
  now: syncNow,
  randomBytes: getRandomBytes,
  origins: appApprovalOrigins(),
  onEvent: (event: ApprovalEvent) => {
    if (event.outcome !== 'ok')
      logger.debug(`[approval] ${event.op}: ${event.outcome}`)
  },
})

/**
 * Claims a code scanned inside the app, once this phone's account session is
 * open (registering the account the first time, as Set Up Another Device does).
 * Resolves the session (claiming) or why it can't start.
 */
export async function startPhoneApproval(
  scanned: string,
  entry: ApprovalEntry
): Promise<
  | { ok: true; session: PhoneApproval }
  | { ok: false; problem: OfferStartProblem }
> {
  analytics.capture('approval_started', { entry })
  if (!accountKeyAvailable()) {
    analytics.capture('approval_failed', { reason: 'unsupported' })
    return { ok: false, problem: 'unsupported' }
  }
  const key = await accountKey.getOrCreate()
  let accountId: string
  try {
    accountId = (await serverAccount.connect(key)).accountId
  } catch (error) {
    const problem = offerStartProblem(error)
    analytics.capture('approval_failed', { reason: problem })
    return { ok: false, problem }
  }
  const session = createPhoneApproval(
    scanned,
    {
      accountKey: key,
      accountId,
      // What the browser shows as "Approved by …": the same name a new phone
      // sees in Set Up Another Device.
      deviceName: handoffHello().deviceName,
      authorize: (run) => accountSessions.withSession(run, { accountKey: key }),
    },
    sessionDeps()
  )
  track(session, entry)
  void session.claim()
  return { ok: true, session }
}

/**
 * YES: sends the account key to the browser once the device's owner confirms it
 * (Face ID, Touch ID, fingerprint, passcode or screen lock), so someone holding
 * the unlocked phone can't sign their own computer in. Tapping YES again after
 * a send that didn't get through doesn't ask again.
 */
export async function approveBrowser(
  session: PhoneApproval,
  { confirmOwner }: { confirmOwner: () => Promise<DeviceOwnerCheck> }
): Promise<'sent' | 'cancelled' | 'failed'> {
  if (!ownerChecks.has(session)) {
    const check = await confirmOwner().catch((error: unknown) => {
      logger.warn("[approval] couldn't confirm the device's owner", error)
      return 'failed' as const
    })
    if (check === 'cancelled' || check === 'failed') return check
    ownerChecks.set(session, check)
  }
  await session.approve()
  return 'sent'
}

/** The User left the screen: ends the claim on the server. */
export const endApproval = (session: PhoneApproval) => session.cancel()
