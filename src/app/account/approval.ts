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
import { type SensitiveCheck, stopsQuietly } from '@/lib/sensitiveCheck'
import { logger } from '@/lib/logger'
import { accountSessions, serverAccount } from '@/lib/serverAccount'
import { appApprovalOrigins } from '@/lib/serverAccount/approvalRuntime'
import {
  type ApprovalEvent,
  createPhoneApproval,
  type PhoneApproval,
} from '@/lib/serverAccount/approvalSession'
import { syncNow } from '@/lib/syncClock'

export type ApprovalEntry = 'settings' | 'tools'

type ApprovalDebugState = {
  session: PhoneApproval | null
  entry: ApprovalEntry | null

  revision: number
}

export const useApprovalDebug = create<ApprovalDebugState>(() => ({
  session: null,
  entry: null,
  revision: 0,
}))

const ownerChecks = new WeakMap<PhoneApproval, 'confirmed' | 'noLock'>()

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

      deviceName: handoffHello().deviceName,
      authorize: (run) => accountSessions.withSession(run, { accountKey: key }),
    },
    sessionDeps()
  )
  track(session, entry)
  void session.claim()
  return { ok: true, session }
}

export async function approveBrowser(
  session: PhoneApproval,
  { confirmOwner }: { confirmOwner: () => Promise<SensitiveCheck> }
): Promise<'sent' | 'cancelled' | 'failed'> {
  if (!ownerChecks.has(session)) {
    const check = await confirmOwner().catch((error: unknown) => {
      logger.warn("[approval] couldn't confirm the device's owner", error)
      return 'failed' as const
    })

    if (stopsQuietly(check)) return 'cancelled'
    if (check === 'failed') return check
    ownerChecks.set(session, check)
  }
  await session.approve()
  return 'sent'
}

export const endApproval = (session: PhoneApproval) => session.cancel()
