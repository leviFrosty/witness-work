/**
 * The takeover arbiter (ADR 0021): one full-screen moment at a time.
 *
 * A **Takeover** is anything that covers the app without being asked for: the
 * update reveal, What's New, the Schedule intro, a celebration, the badges
 * welcome. Each asks for a turn with a claim; the arbiter grants one at a time,
 * in priority order, never interrupts the one showing, leaves a short gap
 * between two, and grants nothing new while something holds the screen (the
 * profile overlay, a sheet, a pushed screen, the app in the background).
 *
 * Pure: every function takes the state and the time and returns the next state,
 * so the rules are unit- and property-tested without React or timers.
 * `src/stores/takeover.ts` keeps the one live state and wakes it on time.
 */

export const TAKEOVER_KINDS = [
  'update-reveal',
  'milestone-reveal',
  'whats-new',
  'schedule-intro',
  'streak-celebration',
  'badge-celebration',
  'badges-welcome',
  'badges-history',
] as const

export type TakeoverKind = (typeof TAKEOVER_KINDS)[number]

export type TakeoverClaim = {
  /** Stable per requester, so asking again updates rather than duplicates. */
  id: string
  kind: TakeoverKind
  /** Lower goes first (`src/app/takeover/policy.ts`). */
  priority: number
  requestedAt: number
  /** Dropped unshown once this time passes (epoch ms). */
  expiresAt?: number
  /** Dropped unshown as soon as one of these holds is placed. */
  expiresOnHold?: readonly string[]
  /**
   * Granted even while something holds the screen: for takeovers the User just
   * asked for themselves (a replay, a help button).
   */
  ignoresHolds?: boolean
  /**
   * At most one claim per group is ever granted. When one is, the others in the
   * group expire; later claims in it expire at once.
   */
  group?: string
  /**
   * A failsafe for takeovers that close themselves: one still showing after
   * this long is released (and reported as expired).
   */
  maxActiveMs?: number
}

export type ActiveTakeover = TakeoverClaim & { grantedAt: number }

export type ArbiterState = {
  /** The takeover on screen, never interrupted. */
  active: ActiveTakeover | null
  /** Claims waiting for their turn. */
  queue: readonly TakeoverClaim[]
  /** Reasons nothing new may take over right now. */
  holds: readonly string[]
  /**
   * When the screen last came free (a takeover released, or the last hold
   * lifted), for the gap before the next one. Null: never taken over.
   */
  clearedAt: number | null
  /** Groups that already had their one grant (newest last, capped). */
  groups: readonly string[]
  /** Claims dropped unshown (or timed out), until their requester lets go. */
  expired: readonly string[]
  /** Kinds granted this session, for "has the reveal shown yet". */
  shown: readonly TakeoverKind[]
}

export type ArbiterConfig = {
  /** The pause between two takeovers, and after the way clears. */
  gapMs: number
}

export const DEFAULT_TAKEOVER_GAP_MS = 700

const MAX_GROUPS = 32

export const initialArbiterState = (): ArbiterState => ({
  active: null,
  queue: [],
  holds: [],
  clearedAt: null,
  groups: [],
  expired: [],
  shown: [],
})

const withAdded = <T>(list: readonly T[], item: T): readonly T[] =>
  list.includes(item) ? list : [...list, item]

const expireIds = (state: ArbiterState, ids: string[]): ArbiterState =>
  ids.length === 0
    ? state
    : {
        ...state,
        queue: state.queue.filter((claim) => !ids.includes(claim.id)),
        expired: ids.reduce(withAdded, state.expired),
      }

/** Whether a queued claim may be granted with these holds. */
const unheld = (state: ArbiterState, claim: TakeoverClaim) =>
  claim.ignoresHolds === true || state.holds.length === 0

const first = (a: TakeoverClaim, b: TakeoverClaim) =>
  a.priority - b.priority || a.requestedAt - b.requestedAt

const grant = (
  state: ArbiterState,
  claim: TakeoverClaim,
  now: number
): ArbiterState => {
  const group = claim.group
  const next: ArbiterState = {
    ...state,
    active: { ...claim, grantedAt: now },
    queue: state.queue.filter((queued) => queued.id !== claim.id),
    expired: state.expired.filter((id) => id !== claim.id),
    shown: withAdded(state.shown, claim.kind),
    groups: group
      ? [...state.groups.filter((g) => g !== group), group].slice(-MAX_GROUPS)
      : state.groups,
  }
  // One grant per group: its other claims go quiet.
  return group
    ? expireIds(
        next,
        next.queue
          .filter((queued) => queued.group === group)
          .map((queued) => queued.id)
      )
    : next
}

/**
 * Applies time: drops expired claims, times out a stuck takeover, and grants
 * the next turn when the screen is free, unheld, and past the gap.
 */
export function settleTakeovers(
  state: ArbiterState,
  now: number,
  config: ArbiterConfig
): ArbiterState {
  let next = expireIds(
    state,
    state.queue
      .filter(
        (claim) => claim.expiresAt !== undefined && claim.expiresAt <= now
      )
      .map((claim) => claim.id)
  )
  const active = next.active
  if (
    active?.maxActiveMs !== undefined &&
    now >= active.grantedAt + active.maxActiveMs
  ) {
    next = {
      ...next,
      active: null,
      clearedAt: now,
      expired: withAdded(next.expired, active.id),
    }
  }
  if (next.active) return next
  if (next.clearedAt !== null && now - next.clearedAt < config.gapMs)
    return next
  const turn = next.queue.filter((claim) => unheld(next, claim)).sort(first)[0]
  return turn ? grant(next, turn, now) : next
}

/** Asks for a turn. Asking again with the same id keeps its place in line. */
export function requestTakeover(
  state: ArbiterState,
  claim: TakeoverClaim,
  now: number,
  config: ArbiterConfig
): ArbiterState {
  if (state.active?.id === claim.id) return state
  const existing = state.queue.find((queued) => queued.id === claim.id)
  const others = state.queue.filter((queued) => queued.id !== claim.id)
  const dead =
    (claim.group !== undefined && state.groups.includes(claim.group)) ||
    (claim.expiresAt !== undefined && claim.expiresAt <= now) ||
    (claim.expiresOnHold ?? []).some((hold) => state.holds.includes(hold))
  if (dead)
    return settleTakeovers(
      {
        ...state,
        queue: others,
        expired: withAdded(state.expired, claim.id),
      },
      now,
      config
    )
  return settleTakeovers(
    {
      ...state,
      queue: [
        ...others,
        { ...claim, requestedAt: existing?.requestedAt ?? claim.requestedAt },
      ],
      expired: state.expired.filter((id) => id !== claim.id),
    },
    now,
    config
  )
}

/**
 * Puts a takeover on screen at once, ignoring holds and the gap: the launch
 * reveal, which is already in the first frame. Waits like any other claim if
 * something else is somehow showing.
 */
export function seedTakeover(
  state: ArbiterState,
  claim: TakeoverClaim,
  now: number,
  config: ArbiterConfig
): ArbiterState {
  if (state.active?.id === claim.id) return state
  if (state.active)
    return requestTakeover(state, { ...claim, ignoresHolds: true }, now, config)
  return grant(state, claim, now)
}

/**
 * The requester is done: closes its takeover, or withdraws its claim if it
 * hasn't shown yet. Also forgets that it expired.
 */
export function releaseTakeover(
  state: ArbiterState,
  id: string,
  now: number,
  config: ArbiterConfig
): ArbiterState {
  const wasActive = state.active?.id === id
  const queued = state.queue.some((claim) => claim.id === id)
  const expired = state.expired.includes(id)
  if (!wasActive && !queued && !expired) return state
  return settleTakeovers(
    {
      ...state,
      active: wasActive ? null : state.active,
      clearedAt: wasActive ? now : state.clearedAt,
      queue: state.queue.filter((claim) => claim.id !== id),
      expired: state.expired.filter((expiredId) => expiredId !== id),
    },
    now,
    config
  )
}

/** Something covers the tabs: nothing new takes over until it's gone. */
export function holdTakeovers(
  state: ArbiterState,
  reason: string,
  now: number,
  config: ArbiterConfig
): ArbiterState {
  if (state.holds.includes(reason)) return state
  const held = { ...state, holds: [...state.holds, reason] }
  return settleTakeovers(
    expireIds(
      held,
      held.queue
        .filter((claim) => claim.expiresOnHold?.includes(reason))
        .map((claim) => claim.id)
    ),
    now,
    config
  )
}

/** A hold is gone; once none are left, the gap starts over. */
export function unholdTakeovers(
  state: ArbiterState,
  reason: string,
  now: number,
  config: ArbiterConfig
): ArbiterState {
  if (!state.holds.includes(reason)) return state
  const holds = state.holds.filter((hold) => hold !== reason)
  return settleTakeovers(
    {
      ...state,
      holds,
      clearedAt: holds.length === 0 ? now : state.clearedAt,
    },
    now,
    config
  )
}

/**
 * The next time `settleTakeovers` would change something with no other event: a
 * claim expiring, a stuck takeover timing out, or the gap ending. Null when
 * only an outside event (a release, a hold lifting) can.
 */
export function nextTakeoverWake(
  state: ArbiterState,
  now: number,
  config: ArbiterConfig
): number | null {
  const times: number[] = []
  if (state.active?.maxActiveMs !== undefined)
    times.push(state.active.grantedAt + state.active.maxActiveMs)
  for (const claim of state.queue)
    if (claim.expiresAt !== undefined) times.push(claim.expiresAt)
  if (
    !state.active &&
    state.clearedAt !== null &&
    now - state.clearedAt < config.gapMs &&
    state.queue.some((claim) => unheld(state, claim))
  )
    times.push(state.clearedAt + config.gapMs)
  return times.length ? Math.min(...times) : null
}
