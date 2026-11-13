import { create } from 'zustand'
import { toB64u } from '@/lib/bytes'
import {
  createGuestSpacesClient,
  type SpaceWireRecord,
} from '@/lib/sharedSpaces/client'
import {
  createSpaceKeyring,
  memoryKeyringStorage,
} from '@/lib/sharedSpaces/keyring'
import {
  guestKeysRecordId,
  inScopeRecordId,
  openRecordWithKey,
  sealRecordWithKey,
} from '@/lib/sharedSpaces/records'
import {
  deriveLinkCredentials,
  parseGuestLinkUrl,
  scopeIdForStreet,
} from '@/lib/sharedSpaces/scopes'
import {
  FAKE_SPACES_URL,
  fakeSpacesClient,
  type FakeSpacesServer,
} from '@/lib/sharedSpaces/testing/fakeSpacesServer'
import { fromB64u } from '@/lib/bytes'
import {
  createTerritoryEngine,
  type TerritoryEngineDeps,
  type TerritoryInvitePayload,
  type TerritoryOutcome,
} from '@/app/territories/engine'
import {
  type TerritoriesState,
  territoriesState,
} from '@/features/territories/stores/territories'
import type { Territory } from '@/features/territories/types/territory'

export const OAK = '11111111-1111-4111-8111-111111111111'
export const ELM = '22222222-2222-4222-8222-222222222222'

export const doorId = (n: number) =>
  `9d8c7b6a-5f4e-4d3c-8b2a-${String(n).padStart(12, '0')}`

export function sampleTerritory(): Territory {
  const at = Date.now() - 60_000
  return {
    id: 'territory-1',
    number: '12',
    name: 'North Hill',
    checkedOutAt: at,
    createdAt: at,
    streets: [
      {
        id: OAK,
        name: 'Oak Street',
        numbering: 'both',
        next: 2,
        doors: [
          { id: doorId(1), label: '1', outcome: 'notHome', at, tries: 1 },
        ],
      },
      { id: ELM, name: 'Elm Street', numbering: 'odd', next: 1, doors: [] },
    ],
    doNotCalls: [
      { id: doorId(50), address: '5 Elm Street', at, streetId: ELM },
      { id: doorId(51), address: '1 Far Away', at },
    ],
  }
}

export type TerritoryTestPerson = ReturnType<typeof territoryPerson>

export function territoryPerson(
  server: FakeSpacesServer,
  name: string,
  random: (length: number) => Uint8Array,
  overrides: Partial<TerritoryEngineDeps> = {},
  account: { seed?: Uint8Array; inboxId?: string } = {}
) {
  const seed = account.seed ?? random(32)
  const inboxId = account.inboxId ?? toB64u(random(16))
  const { client } = fakeSpacesClient(server, {
    randomBytes: random,
    accountKey: seed,
  })
  const store = create<TerritoriesState>()(territoriesState)
  const keyring = createSpaceKeyring(memoryKeyringStorage())
  const outcomes: TerritoryOutcome[] = []
  const reissued: { to: string; invite: TerritoryInvitePayload }[] = []
  const refused: string[] = []
  let privacy = false
  const engine = createTerritoryEngine({
    client,
    store,
    keyring,
    rootSeed: async () => seed,
    profile: () => ({ name, inboxId }),
    privacy: () => privacy,
    variant: 'beta',
    randomBytes: random,
    now: Date.now,
    syncNow: Date.now,
    stamp: (previous = 0) => Math.max(Date.now(), previous + 1),
    onOutcome: (outcome) => outcomes.push(outcome),
    onInviteReissued: (reissue) => reissued.push(reissue),
    onRefused: ({ title }) => refused.push(title),
    ...overrides,
  })
  const territories = () => store.getState().territories
  const territory = (id = 'territory-1') => {
    const found = territories().find((t) => t.id === id)
    if (!found) throw new Error(`${name} has no territory ${id}`)
    return found
  }
  return {
    name,
    inboxId,
    seed,
    store,
    engine,
    keyring,
    outcomes,
    reissued,
    refused,
    territories,
    territory,
    setPrivacy(on: boolean) {
      privacy = on
    },
    update(id: string, change: (t: Territory) => Territory) {
      store.getState().update(id, change)
    },
    buddy: { inboxId, name },
  }
}

export function guestFor(server: FakeSpacesServer, url: string) {
  const link = parseGuestLinkUrl(url)
  if (!link) throw new Error('Not a guest link')
  const { linkToken, linkKey } = deriveLinkCredentials(link.linkSecret)
  const client = createGuestSpacesClient({
    baseUrl: FAKE_SPACES_URL,
    fetchImpl: server.fetchImpl,
  })
  const auth = { spaceId: link.spaceId, linkId: link.linkId, linkToken }
  async function keys() {
    const page = await client.guestSync(auth, { since: 0 })
    const record = page.records.find(
      (r) => r.recordId === guestKeysRecordId(link!.linkId)
    ) as SpaceWireRecord
    const opened = openRecordWithKey(
      linkKey,
      {
        spaceId: link!.spaceId,
        epoch: record.epoch,
        recordId: record.recordId,
        deleted: false,
        stamp: record.stamp,
      },
      record.blob
    )
    return { page, data: opened.data as Record<string, unknown> }
  }
  return {
    link,
    client,
    auth,
    keys,
    async recordDoor(
      streetId: string,
      id: string,
      label: string,
      random: (length: number) => Uint8Array
    ) {
      const { page, data } = await keys()
      const scopeId = scopeIdForStreet(streetId)
      const scopes = data.scopes as Record<string, Record<string, string>>
      const key = fromB64u(scopes[scopeId]![String(page.epoch)]!)
      const recordId = inScopeRecordId(scopeId, id)
      const stamp = Date.now()
      const blob = sealRecordWithKey(
        key,
        {
          spaceId: link!.spaceId,
          epoch: page.epoch,
          recordId,
          deleted: false,
          stamp,
        },
        {
          kind: 'door',
          data: {
            label,
            outcome: 'spoke',
            at: stamp,
            tries: 1,
            by: '77777777-7777-4777-8777-777777777777',
            byName: 'Guest Gail',
          },
        },
        random(24)
      )
      return client.guestPut(auth, [
        { recordId, epoch: page.epoch, stamp, blob },
      ])
    },
  }
}
