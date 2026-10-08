import { create } from 'zustand'
import {
  type ArbiterState,
  DEFAULT_TAKEOVER_GAP_MS,
  holdTakeovers,
  initialArbiterState,
  nextTakeoverWake,
  releaseTakeover,
  requestTakeover,
  seedTakeover,
  settleTakeovers,
  type TakeoverClaim,
  type TakeoverKind,
  unholdTakeovers,
} from '@/lib/takeover/arbiter'

/** Priorities and the gap; installed by `src/app/takeover/policy.ts`. */
export type TakeoverPolicy = {
  priorities: Record<TakeoverKind, number>
  gapMs: number
}

let policy: TakeoverPolicy | null = null

/** Installs the app's priorities. Until then every kind waits its turn FIFO. */
export function configureTakeovers(next: TakeoverPolicy) {
  policy = next
}

const config = () => ({ gapMs: policy?.gapMs ?? DEFAULT_TAKEOVER_GAP_MS })
const priority = (kind: TakeoverKind) => policy?.priorities[kind] ?? 0

export type TakeoverOptions = Pick<
  TakeoverClaim,
  'expiresAt' | 'expiresOnHold' | 'ignoresHolds' | 'group' | 'maxActiveMs'
> & {
  /** Reuse one id per requester; a new one is made otherwise. */
  id?: string
}

type TakeoverStore = {
  arbiter: ArbiterState
  /** Asks for a turn; returns the claim's id. */
  request: (kind: TakeoverKind, options?: TakeoverOptions) => string
  /** On screen at once (the launch reveal); returns the claim's id. */
  seed: (kind: TakeoverKind, options?: TakeoverOptions) => string
  /** Done showing, or no longer wanted. */
  release: (id: string) => void
  hold: (reason: string) => void
  unhold: (reason: string) => void
  /** Something is taking over the screen right now. */
  isTakingOver: () => boolean
}

let counter = 0

/** A fresh claim id for one requester. */
export const newTakeoverId = (kind: TakeoverKind) => `${kind}:${++counter}`

let timer: ReturnType<typeof setTimeout> | null = null

/**
 * The one live takeover arbiter (see `src/lib/takeover/arbiter.ts`). In memory:
 * nothing waits across launches; what has to (the badges welcome) keeps its own
 * flag and asks again. Feature code uses `useTakeoverTurn` and
 * `useTakeoverHold`; plain code calls `request`/`release` and
 * `isTakingOver()`.
 */
export const useTakeover = create<TakeoverStore>((set, get) => {
  const apply = (step: (state: ArbiterState, now: number) => ArbiterState) => {
    const now = Date.now()
    const current = get().arbiter
    const next = step(current, now)
    if (next !== current) set({ arbiter: next })
    wake(now)
  }

  // Claims expire and gaps end on their own; wake up when the next one does.
  const wake = (now: number) => {
    if (timer) clearTimeout(timer)
    timer = null
    const at = nextTakeoverWake(get().arbiter, now, config())
    if (at === null) return
    timer = setTimeout(
      () => {
        timer = null
        apply((state, at) => settleTakeovers(state, at, config()))
      },
      Math.max(0, at - now)
    )
  }

  const claim = (
    kind: TakeoverKind,
    options: TakeoverOptions,
    now: number
  ): TakeoverClaim => {
    const { id, ...rest } = options
    return {
      ...rest,
      id: id ?? newTakeoverId(kind),
      kind,
      priority: priority(kind),
      requestedAt: now,
    }
  }

  return {
    arbiter: initialArbiterState(),
    request: (kind, options = {}) => {
      const now = Date.now()
      const next = claim(kind, options, now)
      apply((state) => requestTakeover(state, next, now, config()))
      return next.id
    },
    seed: (kind, options = {}) => {
      const now = Date.now()
      const next = claim(kind, options, now)
      apply((state) => seedTakeover(state, next, now, config()))
      return next.id
    },
    release: (id) =>
      apply((state, now) => releaseTakeover(state, id, now, config())),
    hold: (reason) =>
      apply((state, now) => holdTakeovers(state, reason, now, config())),
    unhold: (reason) =>
      apply((state, now) => unholdTakeovers(state, reason, now, config())),
    isTakingOver: () => get().arbiter.active !== null,
  }
})

/**
 * Runs `run` once nothing is taking over the screen: now, or as soon as the
 * takeover on screen closes. For navigation that mustn't land underneath one (a
 * link, a push tap). Returns a cancel function.
 */
export function afterTakeovers(run: () => void): () => void {
  if (!useTakeover.getState().isTakingOver()) {
    run()
    return () => {}
  }
  const unsubscribe = useTakeover.subscribe((state) => {
    if (state.arbiter.active) return
    unsubscribe()
    run()
  })
  return unsubscribe
}

/** A JSON-safe summary for `__WW_DEV__.takeover.state()` and logs. */
export function takeoverSnapshot(now = Date.now()) {
  const { active, queue, holds, clearedAt, shown } =
    useTakeover.getState().arbiter
  return {
    active: active
      ? { kind: active.kind, id: active.id, forMs: now - active.grantedAt }
      : null,
    queue: [...queue]
      .sort((a, b) => a.priority - b.priority || a.requestedAt - b.requestedAt)
      .map((claim) => ({
        kind: claim.kind,
        id: claim.id,
        waitedMs: now - claim.requestedAt,
        expiresInMs:
          claim.expiresAt === undefined ? null : claim.expiresAt - now,
        ignoresHolds: claim.ignoresHolds === true,
      })),
    holds: [...holds],
    clearedMsAgo: clearedAt === null ? null : now - clearedAt,
    shown: [...shown],
  }
}

/** Tests only: forgets every claim, hold, and the session's history. */
export function resetTakeovers() {
  if (timer) clearTimeout(timer)
  timer = null
  useTakeover.setState({ arbiter: initialArbiterState() })
}
