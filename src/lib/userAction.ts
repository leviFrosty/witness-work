export type UserActionKind =
  | 'time'
  | 'checkbox'
  | 'visit'
  | 'plan'
  | 'report'
  | 'going'
  | 'buddy'
  | 'dev'

export type UserAction = { id: number; kind: UserActionKind; at: number }

export const CELEBRATION_WINDOW_MS = 15_000

const CAUSE_SLACK_MS = 2_000

let latest: UserAction | null = null
let nextId = 1

export function noteUserAction(
  kind: UserActionKind,
  now: number = Date.now()
): UserAction {
  latest = { id: nextId++, kind, at: now }
  return latest
}

export const lastUserAction = (): UserAction | null => latest

export function userActedWithin(ms: number, now: number = Date.now()) {
  return latest !== null && now >= latest.at && now - latest.at <= ms
}

export function actionBehind(
  changedAt: number,
  now: number = Date.now()
): UserAction | null {
  if (!latest) return null
  if (now - latest.at > CELEBRATION_WINDOW_MS) return null
  if (latest.at < changedAt - CAUSE_SLACK_MS) return null
  return latest
}

export type CelebrationClaim = { group: string; expiresAt: number }

export const celebrationClaim = (action: UserAction): CelebrationClaim => ({
  group: `action:${action.id}`,
  expiresAt: action.at + CELEBRATION_WINDOW_MS,
})

export function resetUserActions() {
  latest = null
}
