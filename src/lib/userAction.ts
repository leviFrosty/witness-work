/**
 * The action rule (ADR 0021): a full-screen celebration plays only right after
 * something the User did themselves in the foreground. Every such save marks
 * itself here with `noteUserAction`; background paths (iCloud Sync, the Watch,
 * Siri, a buddy's reply, a Plan's day arriving overnight) never do, so a path
 * someone forgets to mark ends up quiet rather than interrupting.
 *
 * In memory only: an action never outlives the session it happened in.
 */

/** What the User did. Bounded, so it can name the action in logs. */
export type UserActionKind =
  /** Saved Add Time (including a stopped timer's time) or Service History. */
  | 'time'
  /** The "shared" checkbox, on Home or from the widget. */
  | 'checkbox'
  /** Saved a visit, or logged a Not at Home. */
  | 'visit'
  /** Saved a Plan. */
  | 'plan'
  /** Sent a Service Report, or marked it sent. */
  | 'report'
  /** Answered Going to a buddy's invitation. */
  | 'going'
  /** Confirmed or accepted a buddy. */
  | 'buddy'
  /** Developer Tools, or the verification harness. */
  | 'dev'

export type UserAction = { id: number; kind: UserActionKind; at: number }

/**
 * How long after the User's action a celebration may still start. Add Time
 * closes in about half a second; the streak waits 0.9 s for it, badges settle
 * 1.5 s after the last change and then wait for an idle frame, and a
 * celebration waits 0.7 s after the way clears and for one before it (a
 * streak's plays about 4 s). That's 8 s at worst on a slow phone, so 15 s
 * leaves room. Any later and the User has moved on to something else, and the
 * moment would come out of nowhere: it goes quiet instead (the Home card, the
 * chip flare).
 */
export const CELEBRATION_WINDOW_MS = 15_000

/**
 * How long before a change its cause may have been marked. The mark and the
 * write land in the same tap; the slack only absorbs an await between them.
 */
const CAUSE_SLACK_MS = 2_000

let latest: UserAction | null = null
let nextId = 1

/** Marks that the User just did something that can earn a celebration. */
export function noteUserAction(
  kind: UserActionKind,
  now: number = Date.now()
): UserAction {
  latest = { id: nextId++, kind, at: now }
  return latest
}

/** The User's latest marked action this session, if any. */
export const lastUserAction = (): UserAction | null => latest

/** Whether the User did something in the last `ms`. */
export function userActedWithin(ms: number, now: number = Date.now()) {
  return latest !== null && now >= latest.at && now - latest.at <= ms
}

/**
 * The action behind a change first seen at `changedAt`, while a celebration can
 * still follow it: within the window of `now`, and marked no more than a moment
 * before the change (or after it, in the same batch). Null means the change
 * came from somewhere else.
 */
export function actionBehind(
  changedAt: number,
  now: number = Date.now()
): UserAction | null {
  if (!latest) return null
  if (now - latest.at > CELEBRATION_WINDOW_MS) return null
  if (latest.at < changedAt - CAUSE_SLACK_MS) return null
  return latest
}

/**
 * How a celebration of `action` asks for its turn: it expires with the window,
 * and it shares a group with any other celebration of the same action, so one
 * action gets one celebration (`src/app/takeover/policy.ts`).
 */
export type CelebrationClaim = { group: string; expiresAt: number }

export const celebrationClaim = (action: UserAction): CelebrationClaim => ({
  group: `action:${action.id}`,
  expiresAt: action.at + CELEBRATION_WINDOW_MS,
})

/** Tests only. */
export function resetUserActions() {
  latest = null
}
