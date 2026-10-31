import {
  MAX_SHARED_CAR_PEOPLE,
  openCarInvites,
  takenCarPlaces,
} from '@/lib/mileage/sharedCar'
import type { CarInvitee, CarPerson, MileagePeople } from '@/lib/mileage/people'
import type { SharedCar, SharedCarInvite } from '@/types/sharedCars'

/**
 * What the car form's People section lists for a Shared Car, and what each row
 * lets the User do (docs/mileage-tracking-prd.md, "Shared Cars"). Every person
 * can leave; only the owner removes others (someone whose join never finished
 * too) or stops sharing. Whoever sent an invitation, or the owner, can cancel
 * it. While Shared Cars is off on this device, the car still lists its people,
 * and the only thing left to do is leave it (or stop sharing it, for the
 * owner). Pure, for tests.
 */

export type CarPersonAction = 'leave' | 'stopSharing' | 'remove'

export type CarPeopleRow =
  | {
      kind: 'person'
      key: string
      person: CarPerson
      actions: CarPersonAction[]
    }
  | {
      /**
       * Someone on the car whose member record never synced (a join that didn't
       * finish): "Someone who joined".
       */
      kind: 'unnamed'
      key: string
      memberId: string
      /** The User, whose own record hasn't synced yet. */
      me: boolean
      actions: CarPersonAction[]
    }
  | {
      kind: 'invite'
      key: string
      invite: SharedCarInvite
      invitee: CarInvitee
      canCancel: boolean
    }

export type CarPeopleList = {
  /**
   * The people on the car in the order they joined, then anyone whose join
   * didn't finish, then open invitations.
   */
  rows: CarPeopleRow[]
  /** People and open invitations fill the car: no one more can be invited. */
  full: boolean
}

export function carPeopleList(
  car: SharedCar,
  people: MileagePeople,
  now: number,
  {
    sharing = true,
  }: {
    /** Shared Cars runs on this device; off, only the way off the car stays. */
    sharing?: boolean
  } = {}
): CarPeopleList {
  const owner = car.ownerId === car.myMemberId
  const own: CarPersonAction[] = owner ? ['leave', 'stopSharing'] : ['leave']
  const others: CarPersonAction[] = owner && sharing ? ['remove'] : []
  const persons: CarPeopleRow[] = people.onCar(car.spaceId).map((person) => ({
    kind: 'person',
    key: `m.${person.memberId}`,
    person,
    actions: person.me ? own : others,
  }))
  const unnamed: CarPeopleRow[] = car.unnamedMembers.map(({ memberId }) => {
    const me = memberId === car.myMemberId
    return {
      kind: 'unnamed',
      key: `m.${memberId}`,
      memberId,
      me,
      actions: me ? own : others,
    }
  })
  const invites: CarPeopleRow[] = openCarInvites(car, now).map((invite) => ({
    kind: 'invite',
    key: `i.${invite.inviteId}`,
    invite,
    invitee: people.invitee(car.spaceId, invite),
    canCancel: sharing && (owner || invite.invitedBy === car.myMemberId),
  }))
  return {
    rows: [...persons, ...unnamed, ...invites],
    full: takenCarPlaces(car, now) >= MAX_SHARED_CAR_PEOPLE,
  }
}
