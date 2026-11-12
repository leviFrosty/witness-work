import { describe, expect, it, vi } from 'vitest'
import { fromUtf8, toB64u } from '@/features/buddies/lib/bytes'
import { open } from '@/features/buddies/lib/crypto'
import type {
  BuddiesTerritoriesDeps,
  TerritoryEventNotice,
  TerritoryInviteSend,
  TerritoryMembershipsRoster,
} from '@/features/buddies/lib/engine'
import { deriveIdentity } from '@/features/buddies/lib/keys'
import { describeBuddyEvent } from '@/features/buddies/lib/pushAlerts'
import type { Roster } from '@/features/buddies/lib/schemas'
import {
  type BuddyNotification,
  incomingCarInviteKey,
} from '@/features/buddies/lib/state'
import {
  pair,
  random,
  setup,
} from '@/features/buddies/lib/testing/engineHarness'
import { territoryEventId } from '@/lib/sharedSpaces/crypto'

vi.mock('@/lib/logger', () => import('@/__tests__/mocks/logger'))

const DAY = 24 * 60 * 60 * 1000
const id = () => toB64u(random(16))

function territoriesStub() {
  const notices: TerritoryEventNotice[] = []
  const state = {
    memberships: {
      territories: {},
      leftTerritories: {},
    } as TerritoryMembershipsRoster,
    on: new Set<string>(),
  }
  const deps: BuddiesTerritoriesDeps = {
    memberships: () => state.memberships,
    mergeMemberships: (remote) => {
      state.memberships = {
        territories: {
          ...state.memberships.territories,
          ...remote.territories,
        },
        leftTerritories: {
          ...state.memberships.leftTerritories,
          ...remote.leftTerritories,
        },
      }
    },
    openInvitesTo: () => [],
    replyApplies: () => true,
    isOnCar: (spaceId) => state.on.has(spaceId),
    inviteOpen: () => true,
    onEvent: (notice) => notices.push(notice),
  }
  return { deps, notices, state }
}

async function paired() {
  const env = setup()
  const annaTerritories = territoriesStub()
  const joeTerritories = territoriesStub()
  const anna = env.user('Anna', undefined, undefined, {
    territories: annaTerritories.deps,
  })
  const joe = env.user('Joe', undefined, undefined, {
    territories: joeTerritories.deps,
  })
  await pair(anna, joe)
  const invitation = (
    fields: Partial<TerritoryInviteSend> = {}
  ): TerritoryInviteSend => ({
    spaceId: id(),
    inviteId: id(),
    joinSecret: toB64u(random(32)),
    epoch: 1,
    key: toB64u(random(32)),
    title: '12 · North Hill',
    streets: [],
    handoff: false,
    people: 1,
    expiresAt: env.now() + 7 * DAY,
    ...fields,
  })
  const keyOf = (invite: TerritoryInviteSend) =>
    incomingCarInviteKey(anna.inboxId, invite.inviteId)
  const stored = (inboxId: string, kind: string) =>
    env.fake.inboxes.get(inboxId)!.events.filter((e) => e.kind === kind)
  const pushed = (inboxId: string, kind: string) =>
    env.fake.pushes.filter((p) => p.inboxId === inboxId && p.kind === kind)
  return {
    ...env,
    anna,
    joe,
    annaTerritories,
    joeTerritories,
    invitation,
    keyOf,
    stored,
    pushed,
  }
}

const territoryEntries = (notifications: BuddyNotification[]) =>
  notifications.filter((n) => n.kind.startsWith('territory'))

describe('territory events', () => {
  it('invites a buddy with a push, and their bell asks them to join', async () => {
    const { anna, joe, joeTerritories, invitation, keyOf, stored, pushed } =
      await paired()
    const invite = invitation({ streets: ['Oak Street'] })
    await expect(
      anna.engine.sendTerritoryInvite(joe.inboxId, invite)
    ).resolves.toBe(true)
    expect(stored(joe.inboxId, 'territory.invite')).toEqual([
      expect.objectContaining({
        eventId: territoryEventId(
          'territory.invite',
          anna.inboxId,
          joe.inboxId,
          invite.inviteId
        ),
      }),
    ])
    expect(pushed(joe.inboxId, 'territory.invite')).toHaveLength(1)

    await joe.engine.sync()
    expect(joe.store.getState().carInvites[keyOf(invite)]).toMatchObject({
      family: 'territory',
      status: 'pending',
      spaceId: invite.spaceId,
      territory: {
        title: '12 · North Hill',
        streets: ['Oak Street'],
        handoff: false,
      },
    })
    expect(territoryEntries(joe.store.getState().notifications)).toEqual([
      expect.objectContaining({
        kind: 'territoryInvite',
        shareKey: keyOf(invite),
      }),
    ])
    expect(joeTerritories.notices).toEqual([
      expect.objectContaining({ kind: 'territory.invite' }),
    ])
    await expect(joe.engine.carInviteSecrets(keyOf(invite))).resolves.toEqual({
      joinSecret: invite.joinSecret,
      key: invite.key,
    })
  })

  it('tells the inviter when the buddy joins', async () => {
    const { anna, joe, annaTerritories, invitation, keyOf, pushed } =
      await paired()
    const invite = invitation()
    await anna.engine.sendTerritoryInvite(joe.inboxId, invite)
    await joe.engine.sync()
    await joe.engine.answerCarInvite(keyOf(invite), 'joined')
    expect(pushed(anna.inboxId, 'territory.reply')).toHaveLength(1)

    await anna.engine.sync()
    expect(annaTerritories.notices).toContainEqual({
      kind: 'territory.reply',
      from: joe.inboxId,
      spaceId: invite.spaceId,
      inviteId: invite.inviteId,
      status: 'joined',
    })
    expect(territoryEntries(anna.store.getState().notifications)).toEqual([
      expect.objectContaining({ kind: 'territoryJoined', from: joe.inboxId }),
    ])
  })

  it('takes back an invitation that was canceled', async () => {
    const { anna, joe, invitation, keyOf } = await paired()
    const invite = invitation()
    await anna.engine.sendTerritoryInvite(joe.inboxId, invite)
    await joe.engine.sync()
    await anna.engine.sendTerritoryCancel(joe.inboxId, invite)
    await joe.engine.sync()
    expect(joe.store.getState().carInvites[keyOf(invite)].status).toBe(
      'cancelled'
    )
    expect(territoryEntries(joe.store.getState().notifications)).toEqual([])
  })

  it('tells an existing member a street was handed to them', async () => {
    const { anna, joe, joeTerritories, pushed } = await paired()
    const spaceId = id()
    await anna.engine.sendTerritoryHandoff(joe.inboxId, {
      spaceId,
      scopeId: 'ERERERERQRGBEREREREREQ',
      street: 'Oak Street',
      since: 5,
    })
    expect(pushed(joe.inboxId, 'territory.handoff')).toHaveLength(1)
    await joe.engine.sync()
    expect(territoryEntries(joe.store.getState().notifications)).toEqual([
      expect.objectContaining({
        kind: 'territoryHandoff',
        street: 'Oak Street',
        spaceId,
      }),
    ])
    expect(joeTerritories.notices).toEqual([
      expect.objectContaining({
        kind: 'territory.handoff',
        scopeId: 'ERERERERQRGBEREREREREQ',
      }),
    ])
  })

  it('names the sender in an Android alert for a hand-off invitation', async () => {
    const { anna, joe, invitation, stored } = await paired()
    await anna.engine.sendTerritoryInvite(
      joe.inboxId,
      invitation({ handoff: true, streets: ['Oak Street'] })
    )
    const [event] = stored(joe.inboxId, 'territory.invite')
    const context = joe.engine.alertContext()
    if (!context) throw new Error('No alert context')
    const outcome = describeBuddyEvent(context, event as never)
    expect(outcome).toEqual({
      alert: { type: 'territoryInvite', name: 'Anna', handoff: true },
    })
  })
})

describe('the roster’s territories', () => {
  it('carries territory memberships to the User’s other devices', async () => {
    const { user, fake, anna, annaTerritories } = await paired()
    const [s1, s2] = [id(), id()]
    annaTerritories.state.memberships = {
      territories: { [s1]: { at: 10 }, [s2]: { at: 5 } },
      leftTerritories: { [s2]: 7 },
    }
    anna.engine.noteCarMemberships()
    for (const { run } of anna.timers.splice(0)) run()
    await new Promise((resolve) => setTimeout(resolve, 0))
    const { rosterKey, inboxId } = deriveIdentity(anna.seed)
    const written: Roster = JSON.parse(
      fromUtf8(
        open(
          rosterKey,
          fake.inboxes.get(anna.inboxId)!.roster!.blob,
          `ww-buddies/v1/roster|${inboxId}`
        )
      )
    )
    expect(written.territories).toEqual({ [s1]: { at: 10 } })
    expect(written.leftTerritories).toEqual({ [s2]: 7 })

    const ipad = territoriesStub()
    const annasIpad = user('Anna', undefined, anna.seed, {
      territories: ipad.deps,
    })
    await annasIpad.engine.sync()
    expect(ipad.state.memberships.territories).toHaveProperty(s1)
    expect(ipad.state.memberships.leftTerritories).toEqual({ [s2]: 7 })
  })
})
