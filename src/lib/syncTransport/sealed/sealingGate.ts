import type { SealingAdvert } from '@/lib/syncTransport/sealed/sealedFiles'

const DAY_MS = 24 * 60 * 60_000

export const SEALING_QUIET_DEVICE_MS = 30 * DAY_MS

export const SEALING_READ_MAX_AGE_MS = 15 * 60_000

export type ObservedSnapshot = {
  filename: string

  modifiedAt: number

  sealedKey: string | null

  advert: SealingAdvert | null

  hasPlain: boolean
}

export type FolderView = {
  readAt: number

  complete: boolean
  snapshots: ObservedSnapshot[]

  ownSealed: boolean
}

export type HoldupReason = 'update' | 'no-key' | 'other-account'

export type Holdup = { filename: string; reason: HoldupReason }

export type SealingWait = 'switch' | 'key' | 'read' | 'devices'

export type SealingDecision =
  | { mode: 'sealed' }
  | { mode: 'start' }
  | { mode: 'plain'; waitingFor: SealingWait; holdups: Holdup[] }

export const folderIsSealed = (
  view: FolderView | null,
  remembered: boolean
): boolean =>
  remembered ||
  (view !== null &&
    (view.ownSealed || view.snapshots.some((s) => s.sealedKey !== null)))

export function holdupsIn(
  view: FolderView,
  ownKey: string,
  now: number
): Holdup[] {
  const holdups: Holdup[] = []
  for (const snapshot of view.snapshots) {
    if (now - snapshot.modifiedAt >= SEALING_QUIET_DEVICE_MS) continue
    const key = snapshot.sealedKey ?? snapshot.advert?.key
    if (key === ownKey) continue
    holdups.push({
      filename: snapshot.filename,
      reason:
        snapshot.sealedKey === null && snapshot.advert === null
          ? 'update'
          : key === null || key === undefined
            ? 'no-key'
            : 'other-account',
    })
  }
  return holdups
}

export function decideSealing(input: {
  view: FolderView | null

  remembered: boolean

  ownKey: string | null
  switchOn: boolean
  now: number
}): SealingDecision {
  const { view, ownKey, now } = input
  if (folderIsSealed(view, input.remembered)) return { mode: 'sealed' }
  const plain = (waitingFor: SealingWait, holdups: Holdup[] = []) =>
    ({ mode: 'plain', waitingFor, holdups }) as const
  if (!input.switchOn) return plain('switch')
  if (ownKey === null) return plain('key')
  if (
    view === null ||
    !view.complete ||
    now - view.readAt > SEALING_READ_MAX_AGE_MS ||
    now < view.readAt
  )
    return plain('read', view ? holdupsIn(view, ownKey, now) : [])
  const holdups = holdupsIn(view, ownKey, now)
  return holdups.length ? plain('devices', holdups) : { mode: 'start' }
}
