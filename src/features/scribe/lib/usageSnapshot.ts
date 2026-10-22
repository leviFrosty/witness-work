import type {
  ScribeUsage,
  ScribeUsageWindow,
  ScribeUsageWindowId,
} from '@/features/scribe/types'
import type {
  UsageSnapshotWire,
  UsageWindowWire,
} from '@/features/scribe/lib/wire'

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const finiteOrNull = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null

const WINDOW_IDS: readonly ScribeUsageWindowId[] = [
  'session',
  'weekly',
  'monthly',
]

const parseWindow = (value: unknown): UsageWindowWire | null => {
  if (!isRecord(value)) return null
  const id = value.id as ScribeUsageWindowId
  if (!WINDOW_IDS.includes(id)) return null
  const percent = finiteOrNull(value.percentUsed)
  if (percent === null) return null
  const units = isRecord(value.units) ? value.units : null
  const used = finiteOrNull(units?.used)
  const limit = finiteOrNull(units?.limit)
  return {
    id,
    percentUsed: Math.min(100, Math.max(0, Math.round(percent))),
    resetsAt: finiteOrNull(value.resetsAt),
    ...(used !== null && limit !== null ? { units: { used, limit } } : {}),
  }
}

/**
 * A usage snapshot off the wire (`done.meter`, transcribe `usage`, the
 * `limit_reached` body, `GET /usage`), or null when it isn't one.
 */
export function parseUsageSnapshot(value: unknown): UsageSnapshotWire | null {
  if (!isRecord(value)) return null
  if (value.plan !== 'free' && value.plan !== 'supporter') return null
  const asOf = finiteOrNull(value.asOf)
  if (asOf === null || !Array.isArray(value.windows)) return null
  return {
    plan: value.plan,
    supporterCheckFailed: value.supporterCheckFailed === true,
    windows: value.windows
      .map(parseWindow)
      .filter((window): window is UsageWindowWire => window !== null),
    limited: value.limited === true,
    resetsAt: finiteOrNull(value.resetsAt),
    asOf,
  }
}

/** The windows that limit each plan, shortest first. */
const PLAN_WINDOWS: Record<ScribeUsage['plan'], ScribeUsageWindowId[]> = {
  free: ['monthly'],
  supporter: ['session', 'weekly'],
}

const hasEnded = (resetsAt: number | null, now: number) =>
  resetsAt !== null && resetsAt <= now

/**
 * The snapshot as the server would answer at `now`: a window past its reset
 * reads as unused and not started, and the limit lifts once `resetsAt` (the
 * last full window's reset) has passed. A saved snapshot stays truthful until
 * the next read, even offline or with the screen left open.
 */
export function currentUsageSnapshot(
  snapshot: UsageSnapshotWire,
  now: number
): UsageSnapshotWire {
  const liftsLimit = snapshot.limited && hasEnded(snapshot.resetsAt, now)
  if (
    !liftsLimit &&
    !snapshot.windows.some((window) => hasEnded(window.resetsAt, now))
  )
    return snapshot
  return {
    ...snapshot,
    windows: snapshot.windows.map((window) =>
      hasEnded(window.resetsAt, now)
        ? {
            ...window,
            percentUsed: 0,
            resetsAt: null,
            ...(window.units ? { units: { ...window.units, used: 0 } } : {}),
          }
        : window
    ),
    limited: snapshot.limited && !liftsLimit,
    resetsAt: liftsLimit ? null : snapshot.resetsAt,
  }
}

/**
 * The next time `snapshot` changes on its own (a window resets, or the limit
 * lifts), or null when nothing is waiting to reset.
 */
export function nextUsageChange(
  snapshot: UsageSnapshotWire | null,
  now: number
): number | null {
  if (!snapshot) return null
  const upcoming = [
    ...snapshot.windows.map((window) => window.resetsAt),
    snapshot.limited ? snapshot.resetsAt : null,
  ].filter((at): at is number => at !== null && at > now)
  return upcoming.length ? Math.min(...upcoming) : null
}

/**
 * What the app shows at `now`: percent and reset time per window, never units.
 * Windows a plan isn't limited by are left out, in the plan's order.
 */
export function toScribeUsage(
  saved: UsageSnapshotWire,
  now = Date.now()
): ScribeUsage {
  const snapshot = currentUsageSnapshot(saved, now)
  const windows: ScribeUsageWindow[] = []
  for (const id of PLAN_WINDOWS[snapshot.plan]) {
    const window = snapshot.windows.find((candidate) => candidate.id === id)
    windows.push({
      id,
      percentUsed: window?.percentUsed ?? 0,
      resetsAt: window?.resetsAt ?? null,
    })
  }
  return {
    plan: snapshot.plan,
    windows,
    limited: snapshot.limited,
    resetsAt: snapshot.limited ? snapshot.resetsAt : null,
    supporterCheckFailed: snapshot.supporterCheckFailed,
    asOf: snapshot.asOf,
  }
}

/** The full window when limited: the one that resets last. */
export function fullWindow(
  snapshot: UsageSnapshotWire
): ScribeUsageWindowId | null {
  const full = snapshot.windows.filter(
    (window) =>
      window.percentUsed >= 100 &&
      PLAN_WINDOWS[snapshot.plan].includes(window.id)
  )
  if (!full.length) return null
  return full.reduce((latest, window) =>
    (window.resetsAt ?? 0) > (latest.resetsAt ?? 0) ? window : latest
  ).id
}
