import {
  MAX_SHARED_CAR_PEOPLE,
  openCarInvites,
  takenCarPlaces,
} from '@/lib/mileage/sharedCar'
import type { CarInvitee, CarPerson, MileagePeople } from '@/lib/mileage/people'
import type { SharedCar, SharedCarInvite } from '@/types/sharedCars'

export type CarPersonAction = 'leave' | 'stopSharing' | 'remove'

export type CarPeopleRow =
  | {
      kind: 'person'
      key: string
      person: CarPerson
      actions: CarPersonAction[]
    }
  | {
      kind: 'unnamed'
      key: string
      memberId: string

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
  rows: CarPeopleRow[]

  full: boolean
}

export function carPeopleList(
  car: SharedCar,
  people: MileagePeople,
  now: number,
  {
    sharing = true,
  }: {
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
