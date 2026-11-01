import { MEMBER_AVATAR_MAX } from '@/lib/sharedSpaces/records'
import type { BuddyAvatar } from '@/features/buddies/lib/schemas'
import type {
  SharedCarProfile,
  SharedCarProfileProvider,
} from '@/app/sharedCars/profile'

export type CarProfileDeps = {
  cardName: () => string

  inboxId: () => string | null

  sharesPhoto: () => boolean

  avatar: () => BuddyAvatar | undefined

  shrink: (jpegBase64: string) => Promise<string | undefined>
}

export function createCarProfile(
  deps: CarProfileDeps
): SharedCarProfileProvider {
  let kept: { source: string; data: string | undefined } | null = null

  async function carAvatar(
    avatar: BuddyAvatar | undefined
  ): Promise<string | undefined> {
    if (!avatar) return undefined
    if (avatar.t === 'emoji') return avatar.v
    if (kept?.source === avatar.v) return kept.data
    const data = await deps.shrink(avatar.v).catch(() => undefined)
    const fits = data && data.length <= MEMBER_AVATAR_MAX ? data : undefined
    kept = { source: avatar.v, data: fits }
    return fits
  }

  return async (): Promise<SharedCarProfile> => {
    const inboxId = deps.inboxId()

    if (!inboxId) throw new Error('Buddies has not started on this device')
    const avatar = deps.sharesPhoto()
      ? await carAvatar(deps.avatar())
      : undefined
    return { name: deps.cardName(), inboxId, ...(avatar ? { avatar } : {}) }
  }
}

export const carProfileSource = (
  deps: Omit<CarProfileDeps, 'shrink'>
): string =>
  JSON.stringify([
    deps.cardName(),
    deps.inboxId(),
    deps.sharesPhoto() ? (deps.avatar() ?? null) : null,
  ])
