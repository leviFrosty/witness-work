import { createBackPressure } from '@/lib/sharedSpaces/backPressure'
import {
  isSpaceError,
  SpaceError,
  type SpaceCallOptions,
  type SpaceMemberAuth,
  type SpacesClient,
} from '@/lib/sharedSpaces/client'
import {
  deriveSpaceMember,
  sha256B64u,
  type SpaceMemberKeys,
  type WrapAddress,
  wrapSpaceKey,
} from '@/lib/sharedSpaces/crypto'
import type { SharedCarSyncStatus } from '@/stores/sharedCarsSession'
import {
  SharedCarsError,
  type SharedCarsEngineDeps,
  type SharedCarSyncFailure,
} from '@/app/sharedCars/engine/types'
import type { SharedCar } from '@/types/sharedCars'

export class EngineReset extends SpaceError {
  constructor() {
    super('cancelled')
    this.name = 'EngineReset'
  }
}

export const AMBIGUOUS = new Set<string>([
  'network',
  'timeout',
  'cancelled',
  'unknown',
])

const QUIET_FAILURES = new Set<string>(['network', 'timeout', 'cancelled'])

export type EngineContext = ReturnType<typeof createEngineContext>

export function createEngineContext(deps: SharedCarsEngineDeps) {
  const { store, keyring } = deps
  const backPressure = createBackPressure(deps.now)
  let controller = new AbortController()

  let generation = 0

  let writing = 0

  let putsHeldUntil = 0

  const cars = (): Record<string, SharedCar> => store.getState().cars
  const report = (error: unknown, context: string) =>
    deps.onError?.(error, context)

  function stillCurrent(since: number) {
    if (since !== generation) throw new EngineReset()
  }

  function guard<T>(run: () => Promise<T>): Promise<T> {
    const since = generation
    return run().then(
      (value) => {
        stillCurrent(since)
        return value
      },
      (error: unknown) => {
        stillCurrent(since)
        throw error
      }
    )
  }

  function rethrowReset(error: unknown) {
    if (error instanceof EngineReset) throw error
  }

  function guardedClient(raw: SpacesClient): SpacesClient {
    const guarded =
      <A extends unknown[], R>(call: (...args: A) => Promise<R>) =>
      (...args: A) =>
        guard(() => call(...args))
    return {
      ...raw,
      create: guarded(raw.create),
      sync: guarded(raw.sync),
      syncFrom: (auth, since, onPage, options) => {
        const started = generation
        return guard(() =>
          raw.syncFrom(
            auth,
            since,
            (page) => {
              stillCurrent(started)
              return onPage(page)
            },
            options
          )
        )
      },
      put: guarded(raw.put),
      createInvite: guarded(raw.createInvite),
      deleteInvite: guarded(raw.deleteInvite),
      join: guarded(raw.join),
      leave: guarded(raw.leave),
      removeMember: guarded(raw.removeMember),
      rekey: guarded(raw.rekey),
      deleteSpace: guarded(raw.deleteSpace),
    }
  }

  const client = guardedClient(deps.client)

  let seedTag: string | null = null
  const members = new Map<string, SpaceMemberKeys>()

  async function memberFor(spaceId: string): Promise<SpaceMemberKeys> {
    const seed = await guard(() => deps.rootSeed())
    if (!seed) throw new SharedCarsError('no_account_key')

    const tag = sha256B64u(seed)
    if (tag !== seedTag) {
      members.clear()
      seedTag = tag
    }
    let member = members.get(spaceId)
    if (!member) {
      member = deriveSpaceMember(seed, spaceId)
      members.set(spaceId, member)
    }
    return member
  }

  const auth = (member: SpaceMemberKeys): SpaceMemberAuth => ({
    spaceId: member.spaceId,
    memberId: member.memberId,
    token: member.token,
  })

  const wrapTo = (key: Uint8Array, memberPub: string, address: WrapAddress) =>
    wrapSpaceKey(key, memberPub, address, {
      ephemeral: deps.randomBytes(32),
      nonce: deps.randomBytes(24),
    })

  function engineWrite(write: () => void) {
    writing += 1
    try {
      write()
    } finally {
      writing -= 1
    }
  }

  const update = (spaceId: string, change: (car: SharedCar) => SharedCar) =>
    engineWrite(() => store.getState().updateSharedCar(spaceId, change))

  function setCarStatus(spaceId: string, patch: Partial<SharedCarSyncStatus>) {
    deps.status?.setState((state) => {
      const current = state.cars[spaceId] ?? { syncing: false }
      const next = { ...current, ...patch }
      if (patch.lastSyncAt !== undefined) delete next.lastError
      return { cars: { ...state.cars, [spaceId]: next } }
    })
  }

  function clearCarStatus(spaceId: string) {
    deps.status?.setState((state) => {
      const { [spaceId]: _car, ...carsStatus } = state.cars
      const { [spaceId]: _live, ...live } = state.live
      return { cars: carsStatus, live }
    })
  }

  function joinTime(spaceId: string) {
    const left = store.getState().memberships.leftCars[spaceId]
    return Math.max(deps.syncNow(), left === undefined ? 0 : left + 1)
  }

  function noteAnswered() {
    if (deps.status?.getState().disabled)
      deps.status.setState({ disabled: false })
  }

  function noteFailure(error: unknown) {
    backPressure.note(error)
    if (isSpaceError(error, 'disabled'))
      deps.status?.setState({ disabled: true })
  }

  function noteSyncFailed(error: unknown) {
    const reason: SharedCarSyncFailure = isSpaceError(error)
      ? error.code
      : error instanceof SharedCarsError
        ? error.code
        : 'unknown'
    if (!QUIET_FAILURES.has(reason))
      deps.onOutcome?.({ type: 'sync_failed', reason })
  }

  const puts = {
    held: () => deps.now() < putsHeldUntil,

    suspended(waitMs: number) {
      putsHeldUntil = deps.now() + waitMs
      deps.status?.setState({ suspended: true })
    },

    stored() {
      if (deps.status?.getState().suspended)
        deps.status.setState({ suspended: false })
    },
  }

  const queues = new Map<string, Promise<unknown>>()

  function serial<T>(spaceId: string, task: () => Promise<T>): Promise<T> {
    const since = generation
    const previous = queues.get(spaceId) ?? Promise.resolve()
    const start = async () => {
      stillCurrent(since)
      await keyring.ready()
      stillCurrent(since)
      return task()
    }
    const run = previous.then(start, start)
    const tail = run.then(
      () => undefined,
      () => undefined
    )
    queues.set(spaceId, tail)
    void tail.then(() => {
      if (queues.get(spaceId) === tail) queues.delete(spaceId)
    })
    return run
  }

  const call = (): SpaceCallOptions => ({ signal: controller.signal })

  function cancel() {
    controller.abort()
    controller = new AbortController()
  }

  return {
    deps,
    client,
    store,
    keyring,
    backPressure,
    cars,
    report,
    rethrowReset,

    rootSeed: () => guard(() => deps.rootSeed()),

    profile: () => guard(async () => deps.profile()),

    refreshClock: () => guard(async () => deps.refreshClock?.()),
    memberFor,

    forgetMember: (spaceId: string) => members.delete(spaceId),

    forgetMembers() {
      members.clear()
      seedTag = null
    },
    auth,
    wrapTo,
    engineWrite,
    update,
    isWriting: () => writing > 0,
    setCarStatus,
    clearCarStatus,
    joinTime,
    noteAnswered,
    noteFailure,
    noteSyncFailed,
    puts,
    serial,
    call,
    cancel,

    reset() {
      generation += 1
      cancel()
    },
  }
}
