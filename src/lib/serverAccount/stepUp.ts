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

/**
 * The web's step-up (docs/passkeys-protocol.md, "Step-up on the web"): a
 * passkey tap the server checks, which the session then counts for 5 minutes.
 * `prepare` asks for the challenge before the User taps anything, so the get in
 * `complete` runs straight from their tap (Safari asks for one).
 *
 * - **The server's window:** opening a web session counts as a step-up for 5
 *   minutes, and so does each passkey step-up. While the server still counts
 *   one (`GET /sessions`' `stepUpUntil`), the action goes ahead with no tap,
 *   for any account (`session`). The window is timed on the server's clock and
 *   this page's monotonic one, never the device's wall clock, which the User
 *   can set anywhere. Unreadable means over.
 * - **Offline** it can't run; the action waits (`offline`).
 * - **An account with no passkey** past the window can't step up (`noPasskey`):
 *   signing in again opens a new window.
 *
 * Every confirmation carries `until`, on the page's clock, so an action that
 * still has a step to go (a passkey's create) never starts once the server's
 * window has closed.
 */

/**
 * How long a step-up counts on the server, and how long opening a web session
 * counts as one.
 */
export const STEP_UP_WINDOW_MS = 5 * 60_000

/** What asks for a fresh check; analytics records it. */
export type SensitiveAction =
  | 'recovery_key'
  | 'set_up_device'
  | 'approve_device'
  | 'add_passkey'
  | 'remove_passkey'
  | 'delete_data'
  | 'change_account_key'
  | 'app_lock'

/** Why a step-up didn't pass. */
export type StepUpFailure =
  /** The server didn't verify the assertion (`passkey_failed`). */
  | 'refused'
  /** This browser can't use passkeys. */
  | 'not_supported'
  /** None of the account's passkeys is here or in a password manager. */
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
  /** The RP ID the account's passkeys are for, as the server named it. */
  rpId: string | null
  /** The account's passkeys for that RP ID. */
  credentialIds: string[]
  /**
   * When the challenge is too old to send (page clock): a prompt opened after
   * it would be wasted, so the sheet asks for a new one first.
   */
  staleAt: number
}

/** Still inside the server's window: no tap needed. */
export type StepUpSession = {
  status: 'confirmed'
  via: 'session'
  /** When the server's window closes, less a margin (page clock). */
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
  /** The passkey the server verified (`POST /passkeys/assert`). */
  credentialId: string
  /** The get the server verified, for checks of its own (App Lock). */
  assertion: PasskeyAssertion
  /** The challenge it signed, `b64u`. */
  challenge: string
  /** When the step-up stops counting, less a margin (page clock). */
  until: number
}

export type StepUpResult =
  | StepUpPasskey
  | StepUpSession
  | { status: 'cancelled' }
  | { status: 'offline' }
  | { status: 'noPasskey' }
  | { status: 'failed'; reason: StepUpFailure }

/** `GET /sessions`' clock and window (`activityClient.ts`), server time. */
export type SessionWindow = { now: number; stepUpUntil: number | null }

export type WebStepUpDeps = {
  /** `navigator.onLine`: false means no request is worth sending. */
  online: () => boolean
  /** `POST /passkeys/challenge` (`step-up`), no RP ID. */
  challenge: () => Promise<PasskeyChallenge>
  get: (
    options: PublicKeyCredentialRequestOptionsJSON
  ) => Promise<PasskeyAssertion>
  /** `POST /passkeys/assert` with the session's Bearer token. */
  assert: (args: {
    challengeToken: string
    response: PasskeyResponseJSON
  }) => Promise<{ credentialId: string; stepUpAt: number }>
  /** `GET /sessions`' `now` and `stepUpUntil`; throws when it can't. */
  sessionWindow: () => Promise<SessionWindow>
  /** A monotonic clock in ms (`performance.now()`), never the wall clock. */
  elapsed: () => number
}

/**
 * How long before the server's window ends a step-up stops counting here, so
 * the action that follows still lands inside it. Also how long before a
 * challenge expires it counts as stale.
 */
export const SESSION_STEP_UP_MARGIN_MS = 30_000

/**
 * Actions that always ask for the passkey, whatever the server's window: App
 * Lock keeps the get, and Change Account Key wraps the new key with the
 * passkey's PRF output (ADR 0039 §2).
 */
const PASSKEY_ONLY: ReadonlySet<SensitiveAction> = new Set([
  'app_lock',
  'change_account_key',
])

/** How long a step-up challenge lasts on the server. */
const CHALLENGE_LIFETIME_MS = 5 * 60_000

/** How many ms the server's window has left, or null when it can't tell. */
function windowLeft(window: SessionWindow): number | null {
  const { now, stepUpUntil } = window
  if (stepUpUntil === null || !Number.isFinite(now)) return null
  if (!Number.isFinite(stepUpUntil)) return null
  // Never more than the server's own 5 minutes, whatever it said.
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

/** A request's failure: offline, or why it failed. */
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
  /**
   * The server's window: `session` with its end while it counts, else null.
   * Throws when it can't be read.
   */
  async function serverWindow(): Promise<{ until: number } | null> {
    // From when it asked, so a slow answer never makes it longer.
    const askedAt = deps.elapsed()
    const left = windowLeft(await deps.sessionWindow())
    if (left === null) return null
    const until = askedAt + left - SESSION_STEP_UP_MARGIN_MS
    return until > deps.elapsed() ? { until } : null
  }

  /**
   * Before the User taps: online; inside the server's window; else the
   * challenge, for which passkeys. App Lock and Change Account Key always ask
   * for the passkey (`PASSKEY_ONLY`).
   */
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
    // Never a discoverable get: it would offer other accounts' passkeys.
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

  /** Whether `ready`'s challenge is too old to send. */
  const isStale = (ready: StepUpReady) => deps.elapsed() >= ready.staleAt

  /** The get, from the User's tap, then the server's check. */
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
    // The tap may have taken longer than the connection.
    if (!deps.online()) return { status: 'offline' }
    // The server records the step-up no sooner than this.
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
