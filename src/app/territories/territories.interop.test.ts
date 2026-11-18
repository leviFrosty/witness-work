import { randomBytes as nodeRandomBytes } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import type { LiveSocket } from '@/lib/liveSignal'
import { interopSessions } from '@/lib/serverAccount/testing/interopSessions'
import { createSpacesClient } from '@/lib/sharedSpaces/client'
import { createFakeSpacesServer } from '@/lib/sharedSpaces/testing/fakeSpacesServer'
import { endedCopyId, keptStreetsId } from '@/app/territories/engine'
import {
  doorId,
  OAK,
  sampleTerritory,
  territoryPerson,
  type TerritoryTestPerson,
} from '@/app/territories/testing/territoryPeople'
import { logDoor, updateStreet } from '@/features/territories/lib/doors'

vi.mock('@/lib/logger', () => import('@/__tests__/mocks/logger'))
vi.mock('@/stores/mmkv', () => import('@/__tests__/mocks/mmkv'))
vi.mock(
  '@react-native-async-storage/async-storage',
  () => import('@/__tests__/mocks/asyncStorage')
)

const spacesUrl = process.env.SHARED_SPACES_URL
const devBypass =
  process.env.ACCOUNTS_DEV_BYPASS ?? process.env.EXPO_PUBLIC_API_DEV_BYPASS
const enabled = Boolean(spacesUrl && devBypass)

const random = (length: number) => new Uint8Array(nodeRandomBytes(length))

function person(name: string) {
  const seed = random(32)
  const sessions = interopSessions(random, seed, spacesUrl!)
  const client = createSpacesClient({
    baseUrl: spacesUrl!,
    authorize: (run, { signal }) =>
      sessions.withSession(run, { accountKey: seed, signal }),
    openSocket: (url, headers) =>
      new WebSocket(url, { headers } as never) as unknown as LiveSocket,
  })
  return territoryPerson(
    createFakeSpacesServer({ now: Date.now }),
    name,
    random,
    { client },
    { seed }
  )
}

const record = (who: TerritoryTestPerson, label: string) =>
  who.update('territory-1', (t) =>
    updateStreet(t, OAK, (street) =>
      logDoor(street, {
        id: doorId(Number(label)),
        label,
        outcome: 'spoke',
        at: Date.now(),
      })
    )
  )

const labels = (territory: { streets: { doors: { label: string }[] }[] }) =>
  territory.streets.flatMap((s) => s.doors.map((d) => d.label)).sort()

describe.skipIf(!enabled)('territories interop', () => {
  it('a holder keeps their street when the owner returns the territory', async () => {
    const anna = person('Anna')
    const joe = person('Joe')
    anna.store.getState().save(sampleTerritory())
    const handed = await anna.engine.handOff('territory-1', OAK, joe.buddy)
    if (handed.kind !== 'invite') throw new Error('expected an invite')
    await joe.engine.joinTerritory(handed.invite)
    record(joe, '3')
    await joe.engine.syncAll()
    const spaceId = anna.territory().shared!.spaceId

    await anna.engine.returnTerritory('territory-1')
    expect(labels(anna.territory())).toEqual(['1', '3'])

    record(joe, '5')
    await joe.engine.syncAll()
    const own = joe.territory(keptStreetsId(spaceId))
    expect(own.shared).toBeUndefined()
    expect(own.received).toBeUndefined()
    expect(own.streets.map((s) => s.id)).toEqual([OAK])
    expect(labels(own)).toEqual(['1', '3', '5'])
    expect(joe.territories().some((t) => t.id === endedCopyId(spaceId))).toBe(
      false
    )
  }, 60_000)

  it('a holder whose street was taken back keeps only the ended copy', async () => {
    const anna = person('Anna')
    const joe = person('Joe')
    anna.store.getState().save(sampleTerritory())
    const handed = await anna.engine.handOff('territory-1', OAK, joe.buddy)
    if (handed.kind !== 'invite') throw new Error('expected an invite')
    await joe.engine.joinTerritory(handed.invite)
    const spaceId = anna.territory().shared!.spaceId
    await anna.engine.endHandoff('territory-1', OAK)
    await joe.engine.syncAll()
    expect(joe.territories().map((t) => t.id)).toEqual([endedCopyId(spaceId)])
  }, 60_000)
})
