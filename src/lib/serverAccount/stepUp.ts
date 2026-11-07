import { PasskeyError } from '@/lib/passkeys/errors'
import type {
  PasskeyAssertion,
  PublicKeyCredentialRequestOptionsJSON,
} from '@/lib/passkeys/types'
import {
  type PasskeyChallenge,
  passkeyFailureFor,
  type PasskeyResponseJSON,
} from '@/lib/serverAccount/passkeyClient'

export const STEP_UP_WINDOW_MS = 5 * 60_000

export type SensitiveAction =
  | 'recovery_key'
  | 'set_up_device'
  | 'approve_device'
  | 'add_passkey'
  | 'remove_passkey'
  | 'delete_data'
  | 'change_account_key'
  | 'app_lock'

export type StepUpFailure =
  | 'refused'
  | 'not_supported'
  | 'no_credentials'
  | 'timeout'
  | 'rate_limited'
  | 'update_required'
  | 'unavailable'
  | 'failed'

export type StepUpReady = {
  status: 'ready'
  challengeToken: string
  options: PublicKeyCredentialRequestOptionsJSON

  rpId: string | null

  credentialIds: string[]

  staleAt: number
}

export type StepUpSession = {
  status: 'confirmed'
  via: 'session'

  until: number
}

export type StepUpPrepared =
  | StepUpReady
  | (Omit<StepUpSession, 'status' | 'via'> & { status: 'session' })
  | { status: 'noPasskey' }
  | { status: 'offline' }
  | { status: 'failed'; reason: StepUpFailure }

export type StepUpPasskey = {
  status: 'confirmed'
  via: 'passkey'
  rpId: string | null
  credentialIds: string[]

  credentialId: string

  assertion: PasskeyAssertion

  challenge: string

  until: number
}

export type StepUpResult =
  | StepUpPasskey
  | StepUpSession
  | { status: 'cancelled' }
  | { status: 'offline' }
  | { status: 'noPasskey' }
  | { status: 'failed'; reason: StepUpFailure }

export type SessionWindow = { now: number; stepUpUntil: number | null }

export type WebStepUpDeps = {
  online: () => boolean

  challenge: () => Promise<PasskeyChallenge>
  get: (
    options: PublicKeyCredentialRequestOptionsJSON
  ) => Promise<PasskeyAssertion>

  assert: (args: {
    challengeToken: string
    response: PasskeyResponseJSON
  }) => Promise<{ credentialId: string; stepUpAt: number }>

  sessionWindow: () => Promise<SessionWindow>

  elapsed: () => number
}

export const SESSION_STEP_UP_MARGIN_MS = 30_000

const PASSKEY_ONLY: ReadonlySet<SensitiveAction> = new Set([
  'app_lock',
  'change_account_key',
])

const CHALLENGE_LIFETIME_MS = 5 * 60_000

function windowLeft(window: SessionWindow): number | null {
  const { now, stepUpUntil } = window
  if (stepUpUntil === null || !Number.isFinite(now)) return null
  if (!Number.isFinite(stepUpUntil)) return null

  return Math.min(stepUpUntil - now, STEP_UP_WINDOW_MS)
}

const PASSKEY_FAILURES: Partial<
  Record<PasskeyError['code'], StepUpFailure | 'cancelled'>
> = {
  cancelled: 'cancelled',
  not_supported: 'not_supported',
  domain_not_associated: 'not_supported',
  no_credentials: 'no_credentials',
  timeout: 'timeout',
}

const SERVER_FAILURES: Partial<
  Record<ReturnType<typeof passkeyFailureFor>['failure'], StepUpFailure>
> = {
  passkeyFailed: 'refused',
  rateLimited: 'rate_limited',
  updateRequired: 'update_required',
  unavailable: 'unavailable',
}

function serverFailure(error: unknown): StepUpPrepared & StepUpResult {
  const { failure } = passkeyFailureFor(error)
  if (failure === 'offline') return { status: 'offline' }
  return { status: 'failed', reason: SERVER_FAILURES[failure] ?? 'failed' }
}

const idsOf = (options: Record<string, unknown>): string[] => {
  const allow = options.allowCredentials
  if (!Array.isArray(allow)) return []
  return allow
    .map((entry) => (entry as { id?: unknown } | null)?.id)
    .filter((id): id is string => typeof id === 'string' && id.length > 0)
}

export function createWebStepUp(deps: WebStepUpDeps) {
  async function serverWindow(): Promise<{ until: number } | null> {
    const askedAt = deps.elapsed()
    const left = windowLeft(await deps.sessionWindow())
    if (left === null) return null
    const until = askedAt + left - SESSION_STEP_UP_MARGIN_MS
    return until > deps.elapsed() ? { until } : null
  }

  async function prepare(action: SensitiveAction): Promise<StepUpPrepared> {
    if (!deps.online()) return { status: 'offline' }
    if (!PASSKEY_ONLY.has(action)) {
      let window: { until: number } | null
      try {
        window = await serverWindow()
      } catch (error) {
        return serverFailure(error)
      }
      if (window) return { status: 'session', until: window.until }
    }
    const askedAt = deps.elapsed()
    let challenge: PasskeyChallenge
    try {
      challenge = await deps.challenge()
    } catch (error) {
      return serverFailure(error)
    }
    const credentialIds = idsOf(challenge.options)

    if (credentialIds.length === 0) return { status: 'noPasskey' }
    const rpId = challenge.options.rpId
    return {
      status: 'ready',
      challengeToken: challenge.challengeToken,
      options:
        challenge.options as unknown as PublicKeyCredentialRequestOptionsJSON,
      rpId: typeof rpId === 'string' && rpId ? rpId : null,
      credentialIds,
      staleAt: askedAt + CHALLENGE_LIFETIME_MS - SESSION_STEP_UP_MARGIN_MS,
    }
  }

  const isStale = (ready: StepUpReady) => deps.elapsed() >= ready.staleAt

  async function complete(ready: StepUpReady): Promise<StepUpResult> {
    let assertion: PasskeyAssertion
    try {
      assertion = await deps.get(ready.options)
    } catch (error) {
      const failure =
        error instanceof PasskeyError ? PASSKEY_FAILURES[error.code] : null
      if (failure === 'cancelled') return { status: 'cancelled' }
      return { status: 'failed', reason: failure ?? 'failed' }
    }

    if (!deps.online()) return { status: 'offline' }

    const sentAt = deps.elapsed()
    let credentialId: string
    try {
      ;({ credentialId } = await deps.assert({
        challengeToken: ready.challengeToken,
        response: assertion.response as unknown as PasskeyResponseJSON,
      }))
    } catch (error) {
      return serverFailure(error)
    }
    return {
      status: 'confirmed',
      via: 'passkey',
      rpId: ready.rpId,
      credentialIds: ready.credentialIds,
      credentialId,
      assertion,
      challenge: ready.options.challenge,
      until: sentAt + STEP_UP_WINDOW_MS - SESSION_STEP_UP_MARGIN_MS,
    }
  }

  return { prepare, isStale, complete }
}

export type WebStepUp = ReturnType<typeof createWebStepUp>
