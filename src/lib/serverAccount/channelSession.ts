import { HttpError } from '@/lib/http/request'
import { sessionFailureFor } from '@/lib/serverAccount/session'

export type ChannelFailure =
  | 'offline'
  | 'unavailable'
  | 'expired'
  | 'used'
  | 'conflict'
  | 'cancelled'
  | 'badToken'
  | 'tampered'
  | 'noAccount'
  | 'unverified'
  | 'verifyLater'
  | 'updateRequired'
  | 'rateLimited'
  | 'server'

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

export const CHANNEL_POLL_FAILURE_LIMIT = 5

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

export type ChannelEvent<Status extends string> = {
  at: number
  op: string

  outcome: string
  httpStatus?: number | null

  status?: Status
  ms?: number
}

export type ChannelSessionDeps<Status extends string> = {
  baseUrl: string

  now: () => number
  randomBytes: (length: number) => Uint8Array
  fetchImpl?: typeof fetch

  onEvent?: (event: ChannelEvent<Status>) => void
}

const outcomeOf = (error: unknown) =>
  error instanceof HttpError ? (error.serverCode ?? error.kind) : 'error'

type Listener = () => void

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
