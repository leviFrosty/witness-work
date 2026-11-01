import { emptySharedCar } from '@/lib/mileage/sharedCar'
import { memberTag } from '@/lib/sharedSpaces/crypto'
import type {
  SharedCar,
  SharedCarInvite,
  SharedCarMember,
} from '@/types/sharedCars'

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
