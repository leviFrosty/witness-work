import { randomBytes as nodeRandomBytes } from 'node:crypto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createFakeSpacesServer,
  type FakeSpacesServer,
} from '@/lib/sharedSpaces/testing/fakeSpacesServer'
import type {
  TerritoryHandoffSend,
  TerritoryInviteSend,
} from '@/features/buddies/lib/engine'
import {
  type BuddiesState,
  type IncomingCarInvite,
  incomingCarInviteKey,
} from '@/features/buddies/lib/state'
import {
  ELM,
  OAK,
  sampleTerritory,
  type TerritoryTestPerson,
  territoryPerson,
} from '@/app/territories/testing/territoryPeople'
import {
  createTerritoryInvitations,
  type TerritoryInvitationsEvent,
} from '@/app/territories/territoryInvitations'

vi.mock('@/lib/logger', () => import('@/__tests__/mocks/logger'))
vi.mock('@/lib/locales', () => ({
  default: { t: (key: string) => key },
}))
vi.mock('@/stores/mmkv', () => import('@/__tests__/mocks/mmkv'))
vi.mock(
  '@react-native-async-storage/async-storage',
  () => import('@/__tests__/mocks/asyncStorage')
)

const random = (length: number) => new Uint8Array(nodeRandomBytes(length))

type Mail = { from: string; invite: TerritoryInviteSend }

function relay() {
  const invites: (Mail & { to: string })[] = []
  const cancels: { from: string; to: string; inviteId: string }[] = []
  const handoffs: {
    from: string
    to: string
    handoff: TerritoryHandoffSend
  }[] = []
  return { invites, cancels, handoffs }
}

function withInvitations(
  person: TerritoryTestPerson,
  mail: ReturnType<typeof relay>,
  buddies: TerritoryTestPerson[]
) {
  const received: Record<string, IncomingCarInvite> = {}
  const secrets: Record<string, { joinSecret: string; key: string }> = {}
  const answers: { key: string; answer: string }[] = []
  const events: TerritoryInvitationsEvent[] = []
  const buddiesState = {
    buddies: buddies.map((b) => ({
      inboxId: b.inboxId,
      name: b.name,
      status: 'active',
    })),
    carInvites: received,
  } as unknown as BuddiesState
  const invitations = createTerritoryInvitations({
    engine: person.engine,
    buddies: {
      sendTerritoryInvite: async (to, invite) => {
        mail.invites.push({ from: person.inboxId, to, invite })
        return true
      },
      sendTerritoryCancel: async (to, { inviteId }) => {
        mail.cancels.push({ from: person.inboxId, to, inviteId })
      },
      sendTerritoryHandoff: async (to, handoff) => {
        mail.handoffs.push({ from: person.inboxId, to, handoff })
        return true
      },
      answerCarInvite: async (key, answer) => {
        answers.push({ key, answer })
        received[key] = { ...received[key], status: answer }
        return true
      },
      carInviteSecrets: async (key) => secrets[key] ?? null,
    },
    buddiesStore: { getState: () => buddiesState },
    store: person.store,
    running: () => true,
    now: Date.now,
    onEvent: (event) => events.push(event),
  })
  const deliver = () => {
    for (const { from, to, invite } of mail.invites.splice(0)) {
      if (to !== person.inboxId) continue
      const key = incomingCarInviteKey(from, invite.inviteId)
      secrets[key] = { joinSecret: invite.joinSecret, key: invite.key }
      received[key] = {
        from,
        spaceId: invite.spaceId,
        inviteId: invite.inviteId,
        rev: 1,
        name: invite.title,
        people: invite.people,
        expiresAt: invite.expiresAt,
        receivedAt: Date.now(),
        status: 'pending',
        join: { epoch: invite.epoch },
        family: 'territory',
        territory: {
          title: invite.title,
          streets: invite.streets,
          handoff: invite.handoff,
        },
      }
      return key
    }
    throw new Error(`Nothing for ${person.name}`)
  }
  return { invitations, deliver, answers, events }
}

let server: FakeSpacesServer
let anna: TerritoryTestPerson
let joe: TerritoryTestPerson
let kim: TerritoryTestPerson
let mail: ReturnType<typeof relay>

beforeEach(() => {
  server = createFakeSpacesServer({ now: Date.now })
  anna = territoryPerson(server, 'Anna', random)
  joe = territoryPerson(server, 'Joe', random)
  kim = territoryPerson(server, 'Kim', random)
  anna.store.getState().save(sampleTerritory())
  mail = relay()
})

const shared = (person: TerritoryTestPerson) =>
  person.territories().find((t) => t.shared)

describe('territory invitations', () => {
  it('shares with a buddy who joins from the invitation', async () => {
    const annas = withInvitations(anna, mail, [joe, kim])
    const joes = withInvitations(joe, mail, [anna])
    await expect(
      annas.invitations.share('territory-1', [joe.inboxId])
    ).resolves.toEqual({ sent: 1, widened: 0 })
    expect(mail.invites[0]).toMatchObject({
      to: joe.inboxId,
      invite: { title: '12 · North Hill', streets: [], handoff: false },
    })

    const key = joes.deliver()
    await joes.invitations.join(key)
    expect(joes.answers).toEqual([{ key, answer: 'joined' }])
    expect(joes.events).toEqual([
      { name: 'territory_invite_answered', answer: 'joined', handoff: false },
    ])
    expect(shared(joe)?.streets.map((s) => s.id)).toEqual([OAK, ELM])
    expect(
      joes.invitations.buddiesHandler.isOnCar?.(shared(joe)!.shared!.spaceId)
    ).toBe(true)
  })

  it('cancels a waiting invitation when sharing stops, and declines tidy up', async () => {
    const annas = withInvitations(anna, mail, [joe, kim])
    const kims = withInvitations(kim, mail, [anna])
    await annas.invitations.share('territory-1', [joe.inboxId, kim.inboxId])
    const toJoe = mail.invites.find((m) => m.to === joe.inboxId)!
    await annas.invitations.stopSharing('territory-1', toJoe.invite.inviteId)
    expect(mail.cancels).toEqual([
      {
        from: anna.inboxId,
        to: joe.inboxId,
        inviteId: toJoe.invite.inviteId,
      },
    ])
    mail.invites.splice(mail.invites.indexOf(toJoe), 1)

    const key = kims.deliver()
    await kims.invitations.decline(key)
    expect(kims.events).toEqual([
      { name: 'territory_invite_answered', answer: 'declined', handoff: false },
    ])
    const toKim = shared(anna)!.shares!.find((s) => s.pending)!
    annas.invitations.handleEvent({
      kind: 'territory.reply',
      from: kim.inboxId,
      spaceId: shared(anna)!.shared!.spaceId,
      inviteId: toKim.id,
      status: 'declined',
    })
    await vi.waitFor(() =>
      expect(shared(anna)!.shares!.filter((s) => s.pending)).toEqual([])
    )
  })

  it('hands a street to a buddy on the territory with an event, and to others with an invitation', async () => {
    const annas = withInvitations(anna, mail, [joe, kim])
    const joes = withInvitations(joe, mail, [anna])
    const kims = withInvitations(kim, mail, [anna])
    await annas.invitations.share('territory-1', [joe.inboxId])
    await joes.invitations.join(joes.deliver())

    await annas.invitations.handOff('territory-1', OAK, joe.inboxId)
    expect(mail.handoffs).toEqual([
      expect.objectContaining({
        to: joe.inboxId,
        handoff: expect.objectContaining({ street: 'Oak Street' }),
      }),
    ])

    await annas.invitations.handOff('territory-1', ELM, kim.inboxId)
    const key = kims.deliver()
    await kims.invitations.join(key)
    expect(kims.events).toEqual([
      { name: 'territory_invite_answered', answer: 'joined', handoff: true },
    ])
    expect(shared(kim)?.received?.kind).toBe('handoff')
    expect(shared(kim)?.streets.map((s) => s.id)).toEqual([ELM])
  })

  it('takes back a hand-off nobody accepted yet and tells the buddy', async () => {
    const annas = withInvitations(anna, mail, [kim])
    await annas.invitations.handOff('territory-1', ELM, kim.inboxId)
    const [{ invite }] = mail.invites
    await annas.invitations.endHandoff('territory-1', ELM)
    expect(mail.cancels).toEqual([
      { from: anna.inboxId, to: kim.inboxId, inviteId: invite.inviteId },
    ])
    expect(
      shared(anna)!.streets.find((s) => s.id === ELM)?.handoff
    ).toBeUndefined()
  })
})
