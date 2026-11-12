import { toB64u } from '@/lib/bytes'
import type {
  SpaceMemberAuth,
  SpacePutRecord,
  SpacesClient,
} from '@/lib/sharedSpaces/client'
import {
  deriveSpaceMember,
  newSpaceId,
  wrapSpaceKey,
} from '@/lib/sharedSpaces/crypto'
import {
  guestKeysRecordId,
  HEADER_RECORD_ID,
  inScopeRecordId,
  scopedRecordKey,
  sealRecordWithKey,
  streetRecordId,
  workedRecordId,
} from '@/lib/sharedSpaces/records'
import {
  deriveLinkCredentials,
  deriveLinkSecret,
  deriveScopeKey,
  guestLinkFragment,
  newLinkId,
  scopeIdForStreet,
} from '@/lib/sharedSpaces/scopes'
import type {
  DoorOutcome,
  StreetNumbering,
} from '@/features/territories/types/territory'

export type SeedDoor = {
  label: string
  outcome: DoorOutcome
  at?: number
  byName?: string
}

export type SeedStreet = {
  name: string
  numbering?: StreetNumbering
  first?: number
  doors?: SeedDoor[]
  doNotCalls?: { address: string; label?: string; at?: number }[]
  worked?: boolean
}

export type GuestLinkSpace = {
  auth: SpaceMemberAuth
  spaceKey: Uint8Array
  linkId: string
  linkSecret: Uint8Array
  fragment: string
  scopes: string[]
  streetIds: string[]
  ownerName: string
  houseRecords: boolean
  title: string
  expiresAt: number
}

type Deps = {
  client: SpacesClient
  seed: Uint8Array
  randomBytes: (length: number) => Uint8Array
  randomUUID: () => string
  now: () => number
}

const EPOCH = 1

function sealed(
  deps: Pick<Deps, 'randomBytes'>,
  spaceId: string,
  key: Uint8Array,
  recordId: string,
  stamp: number,
  plaintext: { kind: string; data?: Record<string, unknown> } | null
): SpacePutRecord {
  const deleted = plaintext === null
  return {
    recordId,
    epoch: EPOCH,
    stamp,
    deleted,
    blob: sealRecordWithKey(
      key,
      { spaceId, epoch: EPOCH, recordId, deleted, stamp },
      plaintext ?? { kind: 'door' },
      deps.randomBytes(24)
    ),
  }
}

export async function createGuestLinkSpace(
  deps: Deps,
  {
    number = '12',
    name = 'North Hill',
    ownerName = 'Anna',
    houseRecords = true,
    streets,
    linkStreets,
    lifetimeMs = 24 * 60 * 60 * 1000,
  }: {
    number?: string
    name?: string
    ownerName?: string
    houseRecords?: boolean
    streets: SeedStreet[]
    linkStreets?: number[]
    lifetimeMs?: number
  }
): Promise<GuestLinkSpace> {
  const { client, seed, randomBytes, randomUUID, now } = deps
  const spaceId = newSpaceId(randomBytes)
  const spaceKey = randomBytes(32)
  const member = deriveSpaceMember(seed, spaceId)
  await client.create({
    spaceId,
    memberId: member.memberId,
    dhPub: member.dhPub,
    tokenHash: member.tokenHash,
    wrap: wrapSpaceKey(
      spaceKey,
      member.dhPub,
      { spaceId, epoch: EPOCH, memberId: member.memberId },
      { ephemeral: randomBytes(32), nonce: randomBytes(24) }
    ),
    mode: 'scoped',
  })
  const auth = { spaceId, memberId: member.memberId, token: member.token }
  const at = now()
  const title = `Territory ${number} · ${name}`
  const streetIds = streets.map(() => randomUUID().toLowerCase())
  const scopes = streetIds.map(scopeIdForStreet)
  const seal = (
    recordId: string,
    plaintext: { kind: string; data?: Record<string, unknown> } | null,
    stamp = at
  ) =>
    sealed(
      deps,
      spaceId,
      scopedRecordKey(spaceKey, recordId),
      recordId,
      stamp,
      plaintext
    )

  const records: SpacePutRecord[] = [
    seal(HEADER_RECORD_ID, {
      kind: 'territory',
      data: {
        id: randomUUID().toLowerCase(),
        number,
        name,
        checkedOutAt: at,
        createdAt: at,
        houseRecords,
      },
    }),
  ]
  streets.forEach((street, index) => {
    const scopeId = scopes[index]
    records.push(
      seal(streetRecordId(scopeId), {
        kind: 'street',
        data: {
          id: streetIds[index],
          name: street.name,
          numbering: street.numbering ?? 'both',
          ...(street.first !== undefined && { first: street.first }),
          order: index,
        },
      })
    )
    if (street.worked)
      records.push(
        seal(workedRecordId(scopeId), {
          kind: 'worked',
          data: { at, by: member.memberId, byName: ownerName },
        })
      )
    for (const door of houseRecords ? (street.doors ?? []) : [])
      records.push(
        seal(inScopeRecordId(scopeId, randomUUID().toLowerCase()), {
          kind: 'door',
          data: {
            label: door.label,
            outcome: door.outcome,
            at: door.at ?? at,
            tries: 1,
            by: member.memberId,
            byName: door.byName ?? ownerName,
          },
        })
      )
    for (const entry of street.doNotCalls ?? [])
      records.push(
        seal(inScopeRecordId(scopeId, randomUUID().toLowerCase()), {
          kind: 'doNotCall',
          data: {
            address: entry.address,
            at: entry.at ?? at,
            ...(entry.label && { label: entry.label }),
          },
        })
      )
  })
  for (let index = 0; index < records.length; index += 100)
    await client.put(auth, records.slice(index, index + 100))

  const linkScopes = (linkStreets ?? streets.map((_, index) => index)).map(
    (index) => scopes[index]
  )
  const linkId = newLinkId(randomBytes)
  const linkSecret = deriveLinkSecret(seed, spaceId, linkId)
  const { verifier, linkKey } = deriveLinkCredentials(linkSecret)
  const expiresAt = at + lifetimeMs
  await client.createLink(auth, {
    linkId,
    verifier,
    scopes: linkScopes,
    expiresAt,
    epoch: EPOCH,
  })
  const keysRecordId = guestKeysRecordId(linkId)
  await client.put(auth, [
    sealed(deps, spaceId, linkKey, keysRecordId, at, {
      kind: 'guestKeys',
      data: {
        title,
        from: ownerName,
        houseRecords,
        scopes: Object.fromEntries(
          linkScopes.map((scopeId) => [
            scopeId,
            { [EPOCH]: toB64u(deriveScopeKey(spaceKey, scopeId)) },
          ])
        ),
        expiresAt,
      },
    }),
  ])
  return {
    auth,
    spaceKey,
    linkId,
    linkSecret,
    fragment: guestLinkFragment({ spaceId, linkId, linkSecret }),
    scopes: linkScopes,
    streetIds: linkScopes.map(
      (scopeId) => streetIds[scopes.indexOf(scopeId)] as string
    ),
    ownerName,
    houseRecords,
    title,
    expiresAt,
  }
}

export async function putOwnerDoor(
  deps: Pick<Deps, 'client' | 'randomBytes' | 'randomUUID' | 'now'>,
  space: GuestLinkSpace,
  {
    street = 0,
    label,
    outcome = 'spoke',
    byName = space.ownerName,
  }: { street?: number; label: string; outcome?: DoorOutcome; byName?: string }
) {
  const scopeId = space.scopes[street]
  if (!scopeId) throw new Error('No such street in the link')
  const recordId = inScopeRecordId(scopeId, deps.randomUUID().toLowerCase())
  const stamp = deps.now()
  await deps.client.put(space.auth, [
    sealed(
      deps,
      space.auth.spaceId,
      deriveScopeKey(space.spaceKey, scopeId),
      recordId,
      stamp,
      {
        kind: 'door',
        data: {
          label,
          outcome,
          at: stamp,
          tries: 1,
          by: space.auth.memberId,
          byName,
        },
      }
    ),
  ])
  return recordId
}
