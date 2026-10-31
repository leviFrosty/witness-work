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

/**
 * What every part of the Shared Cars engine shares: its dependencies, the
 * User's member values on each space, one queue per space, the store and status
 * writes the engine makes (which aren't the User's local changes), how hard the
 * server asked it to back off, and the generation `forgetAll` starts.
 */

/**
 * Work started before `forgetAll`, stopped at its next step: nothing it would
 * write is this device's any more. A `cancelled` failure, as any call the
 * engine gave up on is.
 */
export class EngineReset extends SpaceError {
  constructor() {
    super('cancelled')
    this.name = 'EngineReset'
  }
}

/** Failures after which a call may or may not have happened on the server. */
export const AMBIGUOUS = new Set<string>([
  'network',
  'timeout',
  'cancelled',
  'unknown',
])

/** Failures that say nothing about the car: offline, or the caller quit. */
const QUIET_FAILURES = new Set<string>(['network', 'timeout', 'cancelled'])

export type EngineContext = ReturnType<typeof createEngineContext>

export function createEngineContext(deps: SharedCarsEngineDeps) {
  const { store, keyring } = deps
  const backPressure = createBackPressure(deps.now)
  let controller = new AbortController()
  /**
   * Each `forgetAll` starts a new generation. Every wait (a call, the root
   * seed, the profile, the clock, the keyring) ends in `EngineReset` when one
   * started meanwhile, so work from before it writes nothing after it.
   */
  let generation = 0
  /** Writes the engine itself makes, which aren't the User's local changes. */
  let writing = 0
  /** A put refused because the account is suspended holds puts until then. */
  let putsHeldUntil = 0

  const cars = (): Record<string, SharedCar> => store.getState().cars
  const report = (error: unknown, context: string) =>
    deps.onError?.(error, context)

  // --- Generations --------------------------------------------------------

  /** Throws `EngineReset` when `forgetAll` ran since generation `since`. */
  function stillCurrent(since: number) {
    if (since !== generation) throw new EngineReset()
  }

  /** What `run` settles with, unless `forgetAll` ran before it did. */
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

  /** Lets a reset through a `catch` that otherwise carries on. */
  function rethrowReset(error: unknown) {
    if (error instanceof EngineReset) throw error
  }

  /** The server's client, every answer (and sync page) guarded. */
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

  // --- Member values ------------------------------------------------------

  let seedTag: string | null = null
  const members = new Map<string, SpaceMemberKeys>()

  /** The User's member values on `spaceId`, from their root seed. */
  async function memberFor(spaceId: string): Promise<SpaceMemberKeys> {
    const seed = await guard(() => deps.rootSeed())
    if (!seed) throw new SharedCarsError('no_account_key')
    // Another seed (Delete My Buddies Data, then a new one): new member values.
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

  // --- Store and status ---------------------------------------------------

  function engineWrite(write: () => void) {
    writing += 1
    try {
      write()
    } finally {
      writing -= 1
    }
  }

  /** Replaces the car with what `change` makes of it now, in one step. */
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

  /**
   * When the roster says the User joined `spaceId` now: the synced clock, and
   * past an earlier leave of the same car, which a join at or before it
   * wouldn't outlast (a leave stamped by a clock that ran ahead).
   */
  function joinTime(spaceId: string) {
    const left = store.getState().memberships.leftCars[spaceId]
    return Math.max(deps.syncNow(), left === undefined ? 0 : left + 1)
  }

  /** A call the server answered: the kill switch is off again. */
  function noteAnswered() {
    if (deps.status?.getState().disabled)
      deps.status.setState({ disabled: false })
  }

  /** A call failed: back off as long as it asks. */
  function noteFailure(error: unknown) {
    backPressure.note(error)
    if (isSpaceError(error, 'disabled'))
      deps.status?.setState({ disabled: true })
  }

  /**
   * A car's sync (or a share's resumption) failed: why, for analytics. Being
   * offline or cancelled says nothing about Shared Cars, so it isn't counted.
   */
  function noteSyncFailed(error: unknown) {
    const reason: SharedCarSyncFailure = isSpaceError(error)
      ? error.code
      : error instanceof SharedCarsError
        ? error.code
        : 'unknown'
    if (!QUIET_FAILURES.has(reason))
      deps.onOutcome?.({ type: 'sync_failed', reason })
  }

  // --- Suspension ---------------------------------------------------------

  const puts = {
    held: () => deps.now() < putsHeldUntil,
    /** A put answered `suspended`: changes wait here, and the car says so. */
    suspended(waitMs: number) {
      putsHeldUntil = deps.now() + waitMs
      deps.status?.setState({ suspended: true })
    },
    /** A put worked. */
    stored() {
      if (deps.status?.getState().suspended)
        deps.status.setState({ suspended: false })
    },
  }

  // --- One space at a time ------------------------------------------------

  const queues = new Map<string, Promise<unknown>>()

  /**
   * Runs `task` after whatever this space is already doing, once the keyring
   * has loaded. One asked for before a `forgetAll` doesn't run.
   */
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

  /** Cancels everything in flight. */
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
    /** The account key (the Buddies root seed), guarded. */
    rootSeed: () => guard(() => deps.rootSeed()),
    /** What the User's member record says, guarded. */
    profile: () => guard(async () => deps.profile()),
    /** Calibrates the synced clock against the server, guarded. */
    refreshClock: () => guard(async () => deps.refreshClock?.()),
    memberFor,
    /** Forgets the member values derived for `spaceId`. */
    forgetMember: (spaceId: string) => members.delete(spaceId),
    /** Forgets every member value, and the seed they came from. */
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
    /**
     * Starts a new generation, for `forgetAll`: everything in flight is
     * cancelled, and nothing asked for before runs or writes.
     */
    reset() {
      generation += 1
      cancel()
    },
  }
}
