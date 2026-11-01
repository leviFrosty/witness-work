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

export type TakeoverPolicy = {
  priorities: Record<TakeoverKind, number>
  gapMs: number
}

let policy: TakeoverPolicy | null = null

export function configureTakeovers(next: TakeoverPolicy) {
  policy = next
}

const config = () => ({ gapMs: policy?.gapMs ?? DEFAULT_TAKEOVER_GAP_MS })
const priority = (kind: TakeoverKind) => policy?.priorities[kind] ?? 0

export type TakeoverOptions = Pick<
  TakeoverClaim,
  'expiresAt' | 'expiresOnHold' | 'ignoresHolds' | 'group' | 'maxActiveMs'
> & {
  id?: string
}

type TakeoverStore = {
  arbiter: ArbiterState

  request: (kind: TakeoverKind, options?: TakeoverOptions) => string

  seed: (kind: TakeoverKind, options?: TakeoverOptions) => string

  release: (id: string) => void
  hold: (reason: string) => void
  unhold: (reason: string) => void

  isTakingOver: () => boolean
}

let counter = 0

export const newTakeoverId = (kind: TakeoverKind) => `${kind}:${++counter}`

let timer: ReturnType<typeof setTimeout> | null = null

export const useTakeover = create<TakeoverStore>((set, get) => {
  const apply = (step: (state: ArbiterState, now: number) => ArbiterState) => {
    const now = Date.now()
    const current = get().arbiter
    const next = step(current, now)
    if (next !== current) set({ arbiter: next })
    wake(now)
  }

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

export function resetTakeovers() {
  if (timer) clearTimeout(timer)
  timer = null
  useTakeover.setState({ arbiter: initialArbiterState() })
}
