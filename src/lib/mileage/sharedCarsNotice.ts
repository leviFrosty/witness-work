import type { Online } from '@/lib/http/online'
import type { SharedCarsSessionState } from '@/stores/sharedCarsSession'

export type SharedCarsNotice =
  | 'updateRequired'
  | 'suspended'
  | 'disabled'
  | 'offline'
  | 'waiting'
  | 'held'
  | 'tooLarge'
  | null

export function sharedCarsNotice({
  hasSharedCars,
  sharing = true,
  online,
  session,
  updateRequired,
  spaceId,
}: {
  hasSharedCars: boolean

  sharing?: boolean
  online: Online
  session: Pick<SharedCarsSessionState, 'suspended' | 'disabled' | 'cars'>

  updateRequired: boolean

  spaceId?: string
}): SharedCarsNotice {
  if (!hasSharedCars) return null
  const statuses =
    spaceId === undefined
      ? Object.values(session.cars)
      : session.cars[spaceId]
        ? [session.cars[spaceId]]
        : []
  const errors = new Set(
    statuses.flatMap((car) => (car.lastError ? [car.lastError] : []))
  )
  if (updateRequired || errors.has('upgrade_required')) return 'updateRequired'
  if (session.suspended || errors.has('suspended')) return 'suspended'
  if (!sharing || session.disabled || errors.has('disabled')) return 'disabled'
  if (online === false || errors.has('network') || errors.has('timeout'))
    return 'offline'
  if (statuses.some((car) => car.waitingForKey)) return 'waiting'
  if (statuses.some((car) => (car.held ?? 0) > 0)) return 'held'
  if (statuses.some((car) => (car.tooLarge ?? 0) > 0)) return 'tooLarge'
  return null
}
