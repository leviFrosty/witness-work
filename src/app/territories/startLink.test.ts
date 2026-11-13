import { randomBytes as nodeRandomBytes } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createFakeSpacesServer,
  type FakeSpacesServer,
} from '@/lib/sharedSpaces/testing/fakeSpacesServer'
import { useTerritoriesSession } from '@/stores/territoriesSession'
import { startLink } from '@/app/territories/startLink'
import {
  sampleTerritory,
  type TerritoryTestPerson,
  territoryPerson,
} from '@/app/territories/testing/territoryPeople'

const toasts = vi.hoisted(() => ({ error: vi.fn() }))

vi.mock('@/stores/toasts', () => ({ toast: toasts }))
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

let server: FakeSpacesServer
let anna: TerritoryTestPerson

const start = (person: TerritoryTestPerson, ms?: number) =>
  startLink(() => person.engine.createLink('territory-1'), ms)

beforeEach(() => {
  toasts.error.mockReset()
  useTerritoriesSession.setState({ running: true })
  server = createFakeSpacesServer({ now: Date.now })
  anna = territoryPerson(server, 'Anna', random, {
    syncNow: () => Date.now() + 0.25,
  })
  anna.store.getState().save(sampleTerritory())
})

afterEach(() => {
  vi.useRealTimers()
})

describe('starting a guest link', () => {
  it('seeds the territory and answers with the link', async () => {
    const link = await start(anna)
    expect(link?.url).toMatch(/territories\/guest#v1\./)
    expect(toasts.error).not.toHaveBeenCalled()
  })

  it('says sharing is paused while the server switch is off, then works once it is on', async () => {
    server.state.enabled = false
    expect(await start(anna)).toBeNull()
    expect(toasts.error).toHaveBeenCalledWith('territories.share.paused_toast')
    server.state.enabled = true
    expect(await start(anna)).not.toBeNull()
  })

  it('asks for an update when the server refuses the request as malformed', async () => {
    server.refuseNext('create', 400, 'bad_request')
    expect(await start(anna)).toBeNull()
    expect(toasts.error).toHaveBeenCalledWith(
      'territories.share.startOutdated_toast'
    )
  })

  it('names the connection when the server can’t be reached', async () => {
    server.refuseNext('create', 429, 'rate_limited', 1)
    expect(await start(anna)).toBeNull()
    expect(toasts.error).toHaveBeenCalledWith(
      'territories.share.startOffline_toast'
    )
  })

  it('answers when a start stalls before it reaches the server', async () => {
    vi.useFakeTimers()
    const stalled = territoryPerson(server, 'Sam', random, {
      rootSeed: () => new Promise<Uint8Array>(() => {}),
    })
    stalled.store.getState().save(sampleTerritory())
    const answer = start(stalled, 5_000)
    await vi.advanceTimersByTimeAsync(5_000)
    expect(await answer).toBeNull()
    expect(toasts.error).toHaveBeenCalledWith(
      'territories.share.startOffline_toast'
    )
  })

  it('never asks for Buddies', async () => {
    useTerritoriesSession.setState({ running: false })
    expect(await start(anna)).not.toBeNull()
    server.refuseNext('create', 400, 'bad_request')
    anna.store.getState().save({ ...sampleTerritory(), id: 'territory-2' })
    await startLink(() => anna.engine.createLink('territory-2'))
    expect(toasts.error).not.toHaveBeenCalledWith(
      'territories.share.needsBuddies_toast'
    )
  })
})
