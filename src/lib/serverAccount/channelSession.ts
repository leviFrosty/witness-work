import { HttpError } from '@/lib/http/request'
import { sessionFailureFor } from '@/lib/serverAccount/session'

/**
 * What the account-key channels share: Set Up Another Device
 * (`handoffSession.ts`) and approving a browser (`approvalSession.ts`). Each is
 * a small state machine with an event log of codes but no secrets, a budget for
 * failed polls, and the same reading of a failed request.
 */

/** Why a channel attempt stopped, as the screens explain it. */
export type ChannelFailure =
  /** No connection, or the request timed out. */
  | 'offline'
  /** Accounts are off on the server (`disabled`). */
  | 'unavailable'
  /** The channel expired or never existed (`not_found`). */
  | 'expired'
  /** Another device already claimed this code (`conflict` on claim). */
  | 'used'
  /** An op in the wrong state (`conflict`). */
  | 'conflict'
  /** The other side stopped, or five wrong tokens burned the channel. */
  | 'cancelled'
  /** A token was refused (`bad_signature`). */
  | 'badToken'
  /** A blob or key didn't open, or the account didn't match: keys were swapped. */
  | 'tampered'
  /** The server doesn't know this device's account, or it isn't the opener's. */
  | 'noAccount'
  /** This phone couldn't prove it's WitnessWork, so it has no session. */
  | 'unverified'
  /** The same, but only for now: Apple's or Google's check was unavailable. */
  | 'verifyLater'
  /** Ww-api needs a newer app version (426). */
  | 'updateRequired'
  | 'rateLimited'
  /** Anything else the server said. */
  | 'server'

/**
 * Reads a failed channel request. `claim` for the claim itself, where
 * `conflict` means another device claimed the code first.
 */
export function channelFailureFor(
  error: unknown,
  { claim = false }: { claim?: boolean } = {}
): ChannelFailure {
  const shared = sessionFailureFor(error)
  if (shared) return shared
  if (!(error instanceof HttpError)) return 'server'
  switch (error.serverCode) {
    case 'disabled':
      return 'unavailable'
    case 'not_found':
      return 'expired'
    case 'conflict':
      return claim ? 'used' : 'conflict'
    case 'bad_signature':
      return 'badToken'
    case 'unknown_account':
    case 'forbidden':
      return 'noAccount'
    case 'rate_limited':
      return 'rateLimited'
  }
  return error.kind === 'rateLimited' ? 'rateLimited' : 'server'
}

/**
 * Failed status checks in a row, from a busy or restarting server (5xx) or a
 * rate limit, before the attempt fails. Polls run every couple of seconds, so
 * one bad answer mustn't lose a code that's good for minutes.
 */
export const CHANNEL_POLL_FAILURE_LIMIT = 5

/**
 * Whether a failed status check ends the attempt. A lost connection never does
 * (the next tick tries again); a server error or rate limit does only after
 * `CHANNEL_POLL_FAILURE_LIMIT` in a row; anything else does at once.
 */
export function createPollFailures() {
  let inARow = 0
  return {
    succeeded() {
      inARow = 0
    },
    endsAttempt(reason: ChannelFailure) {
      if (reason === 'offline') return false
      if (reason !== 'server' && reason !== 'rateLimited') return true
      inARow += 1
      return inARow >= CHANNEL_POLL_FAILURE_LIMIT
    },
  }
}

/** One request and its answer, as the developer Tools show it. */
export type ChannelEvent<Status extends string> = {
  at: number
  op: string
  /** `ok`, the server's code, or the client's own (`offline`, `tampered`). */
  outcome: string
  httpStatus?: number | null
  /** The channel's status, when the answer carried one. */
  status?: Status
  ms?: number
}

export type ChannelSessionDeps<Status extends string> = {
  baseUrl: string
  /** Request timestamps (`syncNow` in the app); also the expiry clock. */
  now: () => number
  randomBytes: (length: number) => Uint8Array
  fetchImpl?: typeof fetch
  /** Every request's outcome, as it happens. */
  onEvent?: (event: ChannelEvent<Status>) => void
}

const outcomeOf = (error: unknown) =>
  error instanceof HttpError ? (error.serverCode ?? error.kind) : 'error'

type Listener = () => void

/** Keeps the event log and tells subscribers about state changes. */
export function createCore<
  State extends { step: string },
  Status extends string,
  Role extends string,
>(role: Role, initial: State, deps: ChannelSessionDeps<Status>) {
  let state = initial
  const listeners = new Set<Listener>()
  const events: ChannelEvent<Status>[] = []
  const core = {
    get state() {
      return state
    },
    set(next: State) {
      state = next
      for (const listener of listeners) listener()
    },
    subscribe(listener: Listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    events,
    log(event: Omit<ChannelEvent<Status>, 'at'>) {
      const full = { at: Date.now(), ...event }
      events.push(full)
      if (events.length > 200) events.shift()
      deps.onEvent?.(full)
      for (const listener of listeners) listener()
    },
    /** Runs one request, logging its outcome. */
    async call<T>(
      op: string,
      run: () => Promise<T>,
      statusOf?: (value: T) => Status | undefined
    ): Promise<T> {
      const started = Date.now()
      try {
        const value = await run()
        core.log({
          op,
          outcome: 'ok',
          status: statusOf?.(value),
          ms: Date.now() - started,
        })
        return value
      } catch (error) {
        core.log({
          op,
          outcome: outcomeOf(error),
          httpStatus: error instanceof HttpError ? error.status : null,
          ms: Date.now() - started,
        })
        throw error
      }
    },
    role,
  }
  return core
}
