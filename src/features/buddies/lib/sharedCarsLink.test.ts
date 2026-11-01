import { describe, expect, it, vi } from 'vitest'
import { carInvite, sharedCar } from '@/lib/mileage/testing/sharedCars'
import { createSharedCarsMemoryStore } from '@/stores/sharedCars'
import type { SharedCarMemberships } from '@/types/sharedCars'
import {
  createBuddiesCarsLink,
  noteRosterMemberships,
  rosterMembershipChanges,
} from '@/features/buddies/lib/sharedCarsLink'

vi.mock('@/lib/logger', () => import('@/__tests__/mocks/logger'))
vi.mock('@/stores/mmkv', () => import('@/__tests__/mocks/mmkv'))
vi.mock(
  '@react-native-async-storage/async-storage',
  () => import('@/__tests__/mocks/asyncStorage')
)

const NOW = 1_000_000

const memberships = (
  cars: Record<string, number>,
  leftCars: Record<string, number> = {}
): SharedCarMemberships => ({
  cars: Object.fromEntries(
    Object.entries(cars).map(([spaceId, at]) => [spaceId, { at }])
  ),
  leftCars,
})

describe('another device’s memberships', () => {
  it('change only what’s newer here, by the roster’s rule over both', () => {
    const local = memberships({ kept: 10, older: 10, left: 5 }, { left: 7 })
    const remote = memberships(
      { kept: 10, older: 9, added: 3, left: 6, rejoined: 20 },
      { rejoined: 15, ended: 4, left: 7 }
    )
    expect(rosterMembershipChanges(local, remote)).toEqual({
      joined: [
        { spaceId: 'added', at: 3 },
        { spaceId: 'rejoined', at: 20 },
      ],
      left: [
        { spaceId: 'rejoined', at: 15, ends: false },
        { spaceId: 'ended', at: 4, ends: true },
      ],
    })

    const store = createSharedCarsMemoryStore()
    store.setState({ memberships: local })
    noteRosterMemberships(store, remote)
    expect(
      rosterMembershipChanges(store.getState().memberships, remote)
    ).toEqual({ joined: [], left: [] })
  })

  it('never takes back a leave this device owes for an older join', () => {
    const store = createSharedCarsMemoryStore()
    store.setState({
      memberships: memberships({ car: 2 }, { car: 6 }),
      pendingEnds: { car: 'leave' },
    })

    noteRosterMemberships(store, memberships({ car: 4 }))
    expect(store.getState().pendingEnds).toEqual({ car: 'leave' })

    noteRosterMemberships(store, memberships({ car: 8 }))
    expect(store.getState().pendingEnds).toEqual({})
  })
})

describe('the link before Shared Cars sets its handler', () => {
  function link() {
    const store = createSharedCarsMemoryStore()
    return { store, ...createBuddiesCarsLink(store, { now: () => NOW }) }
  }

  it('reads whether the User is on a car, here or by the roster', () => {
    const { store, deps } = link()
    store.setState({
      cars: { here: sharedCar('here') },
      memberships: memberships({ roster: 1, left: 1 }, { left: 2 }),
    })
    expect(['here', 'roster', 'left', 'none'].map(deps.isOnCar!)).toEqual([
      true,
      true,
      false,
      false,
    ])
  })

  it('reads whether an invitation is still open on its car', () => {
    const { store, deps } = link()
    const invites = [
      carInvite('car', 'open', 'Joe'),
      carInvite('car', 'closing', 'Dee'),
      carInvite('car', 'lapsed', 'Cal', { expiresAt: NOW }),
    ]
    store.setState({
      cars: { car: sharedCar('car', { invites }) },
      closingInvites: { car: { closing: {} } },
    })
    expect(
      ['open', 'closing', 'lapsed', 'gone'].map((inviteId) =>
        deps.inviteOpen!('car', inviteId)
      )
    ).toEqual([true, false, false, false])
    expect(deps.inviteOpen!('elsewhere', 'open')).toBe(false)
  })

  it('counts every car the User may still be on as not left, so the seed stays', async () => {
    const { store, deps } = link()
    store.setState({
      cars: {
        here: sharedCar('here', {
          vehicles: [{ id: 'v', name: 'Mazda', createdAt: 1 }],
        }),
      },
      memberships: memberships({ here: 1, roster: 1 }),
      pendingEnds: { leaving: 'leave' },
      joining: {
        joining: { spaceId: 'joining', inviteId: 'i', epoch: 1, startedAt: 1 },
      },
    })
    await expect(deps.leaveAll!()).resolves.toEqual({
      pending: 4,
      notLeft: [
        { spaceId: 'here', name: 'Mazda' },
        { spaceId: 'roster', name: '' },
        { spaceId: 'leaving', name: '' },
        { spaceId: 'joining', name: '' },
      ],
    })
  })

  it('marks an invitation whose `car.invite` was lost owed on its car, for Shared Cars to send again', () => {
    const { store, deps } = link()
    const record = carInvite('car', 'lost', 'Joe')
    store.setState({
      cars: {
        car: sharedCar('car', {
          inviteRecords: [record],
          sentInvites: { lost: { epoch: 1 } },
        }),
      },
    })
    deps.onInviteLost!({ to: 'inbox', spaceId: 'car', inviteId: 'lost' })
    expect(store.getState().cars.car.sentInvites).toEqual({
      lost: { epoch: 1, owed: true },
    })
    expect(store.getState().cars.car.inviteRecords).toEqual([record])

    deps.onInviteLost!({ to: 'inbox', spaceId: 'car', inviteId: 'other' })
    deps.onInviteLost!({ to: 'inbox', spaceId: 'gone', inviteId: 'lost' })
    expect(store.getState().cars.car.sentInvites).toEqual({
      lost: { epoch: 1, owed: true },
    })
  })

  it('counts the leaves and invitation closes this device owes', async () => {
    const { store, deps } = link()
    store.setState({
      cars: { car: sharedCar('car') },
      pendingEnds: { leaving: 'leave' },
      closingInvites: { car: { a: {}, b: { tag: 't' } }, gone: { c: {} } },
    })

    await expect(deps.finishPending!()).resolves.toEqual({ pending: 3 })
  })
})
