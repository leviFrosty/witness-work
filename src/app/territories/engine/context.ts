import { createBackPressure } from '@/lib/sharedSpaces/backPressure'
import {
  isSpaceError,
  SpaceError,
  type SpaceCallOptions,
  type SpaceMemberAuth,
} from '@/lib/sharedSpaces/client'
import {
  deriveSpaceMember,
  sha256B64u,
  type SpaceMemberKeys,
  type WrapAddress,
  wrapSpaceKey,
} from '@/lib/sharedSpaces/crypto'
import {
  type TerritoryEngineDeps,
  TerritorySharingError,
  type TerritorySyncFailure,
} from '@/app/territories/engine/types'
import type { TerritorySpace } from '@/features/territories/types/sharedTerritory'

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

const DAY_MS = 24 * 60 * 60 * 1000

export type EngineContext = ReturnType<typeof createEngineContext>

export function createEngineContext(deps: TerritoryEngineDeps) {
  const { store, keyring } = deps
  const backPressure = createBackPressure(deps.now)
  let controller = new AbortController()
  let generation = 0
  let putsHeldUntil = 0
  const failuresReported = new Map<string, number>()

  const spaces = (): Record<string, TerritorySpace> => store.getState().spaces
  const space = (spaceId: string) => spaces()[spaceId]
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

  const client = new Proxy(deps.client, {
    get(target, name, receiver) {
      const value = Reflect.get(target, name, receiver) as unknown
      if (typeof value !== 'function') return value
      return (...args: unknown[]) =>
        guard(() =>
          (value as (...a: unknown[]) => Promise<unknown>).apply(target, args)
        )
    },
  })

  let seedTag: string | null = null
  const members = new Map<string, SpaceMemberKeys>()

  async function seed(): Promise<Uint8Array> {
    const value = await guard(() => deps.rootSeed())
    if (!value) throw new TerritorySharingError('no_account_key')
    const tag = sha256B64u(value)
    if (tag !== seedTag) {
      members.clear()
      seedTag = tag
    }
    return value
  }

  async function memberFor(spaceId: string): Promise<SpaceMemberKeys> {
    const root = await seed()
    let member = members.get(spaceId)
    if (!member) {
      member = deriveSpaceMember(root, spaceId)
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

  const update = (
    spaceId: string,
    change: (current: TerritorySpace) => TerritorySpace
  ) => store.getState().updateSpace(spaceId, change)

  function noteFailure(error: unknown) {
    backPressure.note(error)
  }

  function noteSyncFailed(error: unknown) {
    const reason: TerritorySyncFailure = isSpaceError(error)
      ? error.code
      : error instanceof TerritorySharingError
        ? error.code
        : 'unknown'
    if (QUIET_FAILURES.has(reason)) return
    const day = Math.floor(deps.now() / DAY_MS)
    if (failuresReported.get(reason) === day) return
    failuresReported.set(reason, day)
    deps.onOutcome?.({ type: 'sync_failed', reason })
  }

  const puts = {
    held: () => deps.now() < putsHeldUntil,
    suspend(waitMs: number) {
      putsHeldUntil = deps.now() + waitMs
    },
  }

  const queues = new Map<string, Promise<unknown>>()

  function serial<T>(key: string, task: () => Promise<T>): Promise<T> {
    const since = generation
    const previous = queues.get(key) ?? Promise.resolve()
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
    queues.set(key, tail)
    void tail.then(() => {
      if (queues.get(key) === tail) queues.delete(key)
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
    spaces,
    space,
    report,
    rethrowReset,
    seed,
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
    update,
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
