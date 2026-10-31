import { emptySharedCar } from '@/lib/mileage/sharedCar'
import { memberTag } from '@/lib/sharedSpaces/crypto'
import type {
  SharedCar,
  SharedCarInvite,
  SharedCarMember,
} from '@/types/sharedCars'

/** A Shared Car with nothing on it, which `overrides` fill in. */
export const sharedCar = (
  spaceId: string,
  overrides: Partial<SharedCar> = {}
): SharedCar =>
  emptySharedCar(spaceId, {
    myMemberId: `me-${spaceId}`,
    ownerId: `me-${spaceId}`,
    epoch: 1,
    ...overrides,
  })

/**
 * A person on `spaceId` called `name`. Their tag is the one their Buddies inbox
 * (`inbox`, else `inbox-<memberId>`) has on the car, so they match that buddy.
 */
export const carMember = (
  spaceId: string,
  memberId: string,
  name: string,
  overrides: Partial<SharedCarMember> & { inbox?: string } = {}
): SharedCarMember => {
  const { inbox = `inbox-${memberId}`, ...rest } = overrides
  return {
    memberId,
    name,
    tag: memberTag(spaceId, inbox),
    joinedAt: 1,
    ...rest,
  }
}

/** An invitation to `spaceId` for the buddy with Buddies inbox `inbox`. */
export const carInvite = (
  spaceId: string,
  inviteId: string,
  name: string,
  overrides: Partial<SharedCarInvite> & { inbox?: string } = {}
): SharedCarInvite => {
  const { inbox = `inbox-${inviteId}`, ...rest } = overrides
  return {
    inviteId,
    invitedBy: `me-${spaceId}`,
    name,
    tag: memberTag(spaceId, inbox),
    expiresAt: Number.MAX_SAFE_INTEGER,
    ...rest,
  }
}
