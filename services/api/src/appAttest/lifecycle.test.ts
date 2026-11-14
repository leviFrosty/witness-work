import { beforeEach, describe, expect, it, vi } from 'vitest'
import { bytesToBase64Url } from '../crypto'
import { AppAttestError } from './errors'
import { appAttestLifecycle } from './lifecycle'
import {
  APP_ATTEST_CHALLENGE_TTL_SECONDS,
  NOTES_IMPORT_VERIFY_PURPOSE,
  type V2AssertionRequest,
  type V2BindRequest,
  type V2ChallengeRequest,
  type V2EnrollRequest,
} from './protocol'
import { makeMemoryKv, type MemoryKv } from '../test/memoryKv'
import type { Environment } from '../types'
import type {
  AppAttestIdentityDependencies,
  AppAttestIdentity as AppAttestIdentityType,
} from './identityDO'

vi.mock('cloudflare:workers', () => ({
  DurableObject: class {
    ctx: DurableObjectState
    env: unknown
    constructor(ctx: DurableObjectState, env: unknown) {
      this.ctx = ctx
      this.env = env
    }
  },
}))

const UUID = '65A8B00C-DA7A-4E0A-BA5C-8E3D1B8C5F1C'
const KEY_A = `${'A'.repeat(43)}=`
const KEY_B = `${'E'.repeat(43)}=`
const CONTENT_HASH = 'c'.repeat(64)
const REQUEST_HASH = 'd'.repeat(64)
const TOKEN_A = bytesToBase64Url(new Uint8Array(32).fill(1))
const TOKEN_B = bytesToBase64Url(new Uint8Array(32).fill(2))
const PRIMARY_BUNDLE = 'com.example.app'
const BETA_BUNDLE = 'com.example.app.beta'

interface FakeIdentity {
  uuid: string
  keyId: string
  spki: string
  signCount: number
  environment: string
  attestedAt: number
  recoveryVerifier: string | null
  bundleId: string | null
}

interface FakeOperation {
  operationId: string
  descriptorHash: string
  operation: string
  challenge: string
  expiresAt: number
  attemptHash: string | null
  completionHash: string | null
  resultJson: string | null
  errorJson: string | null
  completedAt: number | null
}

interface FakeMirrorAction {
  sequence: number
  action: string
  mirrorKey: string
  valueJson: string | null
}

interface FakeSqlState {
  identity: FakeIdentity | null
  operations: Map<string, FakeOperation>
  legacyChallenges: Map<string, number>
  legacyRegistrationReceipts: Map<
    string,
    { requestHash: string; completedAt: number }
  >
  retiredKeys: Map<string, number>
  mirrorOutbox: Map<number, FakeMirrorAction>
  nextMirrorSequence: number
  alarmAt: number | null
  failCompleteOnce: boolean
  /** Models an identity table created before the bundle_id column existed. */
  hasBundleIdColumn: boolean
}

const cursor = <T>(rows: T[]) => ({
  toArray: () => rows,
  one: () => {
    if (!rows.length) throw new Error('Expected one fake SQL row')
    return rows[0]
  },
})

const cloneState = (state: FakeSqlState) => ({
  identity: state.identity ? { ...state.identity } : null,
  operations: new Map(
    [...state.operations].map(([key, value]) => [key, { ...value }])
  ),
  legacyChallenges: new Map(state.legacyChallenges),
  legacyRegistrationReceipts: new Map(
    [...state.legacyRegistrationReceipts].map(([key, value]) => [
      key,
      { ...value },
    ])
  ),
  retiredKeys: new Map(state.retiredKeys),
  mirrorOutbox: new Map(
    [...state.mirrorOutbox].map(([key, value]) => [key, { ...value }])
  ),
  nextMirrorSequence: state.nextMirrorSequence,
  alarmAt: state.alarmAt,
  failCompleteOnce: state.failCompleteOnce,
  hasBundleIdColumn: state.hasBundleIdColumn,
})

const restoreState = (
  state: FakeSqlState,
  snapshot: ReturnType<typeof cloneState>
) => {
  state.identity = snapshot.identity
  state.operations = snapshot.operations
  state.legacyChallenges = snapshot.legacyChallenges
  state.legacyRegistrationReceipts = snapshot.legacyRegistrationReceipts
  state.retiredKeys = snapshot.retiredKeys
  state.mirrorOutbox = snapshot.mirrorOutbox
  state.nextMirrorSequence = snapshot.nextMirrorSequence
  state.alarmAt = snapshot.alarmAt
  // Fault injection models an external one-shot storage fault, not SQL state,
  // so intentionally do not roll this flag back.
}

const fakeContext = (state: FakeSqlState): DurableObjectState => {
  const exec = (rawQuery: string, ...args: unknown[]) => {
    const query = rawQuery.replace(/\s+/g, ' ').trim()
    if (query.startsWith('CREATE TABLE') || query.startsWith('CREATE INDEX')) {
      return cursor([])
    }
    if (query === 'PRAGMA table_info(identity)') {
      return cursor(
        [
          'singleton',
          'uuid',
          'key_id',
          'spki',
          'sign_count',
          'environment',
          'attested_at',
          'recovery_verifier',
          ...(state.hasBundleIdColumn ? ['bundle_id'] : []),
        ].map((name) => ({ name }))
      )
    }
    if (query === 'ALTER TABLE identity ADD COLUMN bundle_id TEXT') {
      if (state.hasBundleIdColumn) throw new Error('duplicate column bundle_id')
      state.hasBundleIdColumn = true
      if (state.identity) state.identity.bundleId = null
      return cursor([])
    }

    if (query.includes('FROM identity WHERE singleton = 1')) {
      if (!state.hasBundleIdColumn) throw new Error('no such column: bundle_id')
      return cursor(state.identity ? [{ ...state.identity }] : [])
    }
    if (query.startsWith('INSERT INTO identity')) {
      if (state.identity) throw new Error('identity already exists')
      state.identity = {
        uuid: String(args[0]),
        keyId: String(args[1]),
        spki: String(args[2]),
        signCount: Number(args[3]),
        environment: String(args[4]),
        attestedAt: Number(args[5]),
        recoveryVerifier: args[6] == null ? null : String(args[6]),
        bundleId: args[7] == null ? null : String(args[7]),
      }
      return cursor([])
    }
    if (query.startsWith('UPDATE identity SET key_id = ?')) {
      if (!state.identity) throw new Error('identity missing')
      state.identity.keyId = String(args[0])
      state.identity.spki = String(args[1])
      state.identity.signCount = 0
      state.identity.environment = String(args[2])
      state.identity.bundleId = args[3] == null ? null : String(args[3])
      state.identity.attestedAt = Number(args[4])
      return cursor([])
    }
    if (
      query.startsWith(
        'UPDATE identity SET sign_count = ?, recovery_verifier = ?'
      )
    ) {
      if (!state.identity) throw new Error('identity missing')
      state.identity.signCount = Number(args[0])
      state.identity.recoveryVerifier = String(args[1])
      return cursor([])
    }
    if (query === 'UPDATE identity SET sign_count = ? WHERE singleton = 1') {
      if (!state.identity) throw new Error('identity missing')
      state.identity.signCount = Number(args[0])
      return cursor([])
    }

    if (
      query ===
      'DELETE FROM operation WHERE completion_hash IS NULL AND expires_at <= ?'
    ) {
      const now = Number(args[0])
      for (const [operationId, operation] of state.operations) {
        if (operation.completionHash == null && operation.expiresAt <= now) {
          state.operations.delete(operationId)
        }
      }
      return cursor([])
    }
    if (
      query ===
      'DELETE FROM operation WHERE completion_hash IS NOT NULL AND completed_at < ?'
    ) {
      const cutoff = Number(args[0])
      for (const [operationId, operation] of state.operations) {
        if (
          operation.completionHash != null &&
          operation.completedAt != null &&
          operation.completedAt < cutoff
        ) {
          state.operations.delete(operationId)
        }
      }
      return cursor([])
    }
    if (
      query.startsWith(
        'DELETE FROM operation WHERE operation_id IN ( SELECT operation_id FROM operation'
      )
    ) {
      const offset = Number(args[0])
      const completed = [...state.operations.values()]
        .filter((operation) => operation.completionHash != null)
        .sort(
          (left, right) =>
            (right.completedAt ?? 0) - (left.completedAt ?? 0) ||
            right.operationId.localeCompare(left.operationId)
        )
      for (const operation of completed.slice(offset)) {
        state.operations.delete(operation.operationId)
      }
      return cursor([])
    }
    if (query === 'DELETE FROM operation WHERE operation_id = ?') {
      state.operations.delete(String(args[0]))
      return cursor([])
    }
    if (query.includes('FROM operation WHERE operation_id = ?')) {
      const operation = state.operations.get(String(args[0]))
      return cursor(operation ? [{ ...operation }] : [])
    }
    if (query.startsWith('SELECT COUNT(*) AS count FROM operation')) {
      const now = Number(args[0])
      const count = [...state.operations.values()].filter(
        (operation) =>
          operation.completionHash == null && operation.expiresAt > now
      ).length
      return cursor([{ count }])
    }
    if (query.startsWith('INSERT INTO operation')) {
      const operationId = String(args[0])
      if (state.operations.has(operationId)) {
        throw new Error('operation already exists')
      }
      state.operations.set(operationId, {
        operationId,
        descriptorHash: String(args[1]),
        operation: String(args[2]),
        challenge: String(args[3]),
        expiresAt: Number(args[4]),
        attemptHash: null,
        completionHash: null,
        resultJson: null,
        errorJson: null,
        completedAt: null,
      })
      return cursor([])
    }
    if (query.startsWith('UPDATE operation SET attempt_hash = ?')) {
      const operation = state.operations.get(String(args[1]))
      if (!operation) throw new Error('operation missing')
      if (operation.attemptHash == null) operation.attemptHash = String(args[0])
      return cursor([])
    }
    if (query.startsWith('UPDATE operation SET completion_hash = ?')) {
      if (state.failCompleteOnce) {
        state.failCompleteOnce = false
        throw new Error('injected completion write failure')
      }
      const operation = state.operations.get(String(args[4]))
      if (!operation) throw new Error('operation missing')
      operation.completionHash = String(args[0])
      operation.resultJson = args[1] == null ? null : String(args[1])
      operation.errorJson = args[2] == null ? null : String(args[2])
      operation.completedAt = Number(args[3])
      return cursor([])
    }

    if (query.includes('FROM legacy_registration_receipt WHERE challenge_hash = ?')) {
      const receipt = state.legacyRegistrationReceipts.get(String(args[0]))
      return cursor(receipt ? [{ requestHash: receipt.requestHash }] : [])
    }
    if (
      query.startsWith(
        'DELETE FROM legacy_registration_receipt WHERE completed_at <'
      )
    ) {
      const cutoff = Number(args[0])
      for (const [hash, receipt] of state.legacyRegistrationReceipts) {
        if (receipt.completedAt < cutoff) {
          state.legacyRegistrationReceipts.delete(hash)
        }
      }
      return cursor([])
    }
    if (
      query.startsWith(
        'DELETE FROM legacy_registration_receipt WHERE challenge_hash IN'
      )
    ) {
      const offset = Number(args[0])
      const retained = [...state.legacyRegistrationReceipts]
        .sort(
          ([leftHash, left], [rightHash, right]) =>
            right.completedAt - left.completedAt ||
            rightHash.localeCompare(leftHash)
        )
        .slice(offset)
      for (const [hash] of retained) {
        state.legacyRegistrationReceipts.delete(hash)
      }
      return cursor([])
    }
    if (query.startsWith('INSERT INTO legacy_registration_receipt')) {
      const challengeHash = String(args[0])
      if (state.legacyRegistrationReceipts.has(challengeHash)) {
        throw new Error('legacy registration receipt already exists')
      }
      state.legacyRegistrationReceipts.set(challengeHash, {
        requestHash: String(args[1]),
        completedAt: Number(args[2]),
      })
      return cursor([])
    }

    if (query.startsWith('SELECT COUNT(*) AS count FROM legacy_challenge')) {
      return cursor([
        { count: state.legacyChallenges.has(String(args[0])) ? 1 : 0 },
      ])
    }
    if (query.startsWith('DELETE FROM legacy_challenge WHERE consumed_at <')) {
      const cutoff = Number(args[0])
      for (const [hash, consumedAt] of state.legacyChallenges) {
        if (consumedAt < cutoff) state.legacyChallenges.delete(hash)
      }
      return cursor([])
    }
    if (query.startsWith('DELETE FROM legacy_challenge WHERE challenge_hash IN')) {
      const offset = Number(args[0])
      const retained = [...state.legacyChallenges]
        .sort(
          ([leftHash, leftTime], [rightHash, rightTime]) =>
            rightTime - leftTime || rightHash.localeCompare(leftHash)
        )
        .slice(offset)
      for (const [hash] of retained) state.legacyChallenges.delete(hash)
      return cursor([])
    }
    if (query.startsWith('INSERT INTO legacy_challenge')) {
      state.legacyChallenges.set(String(args[0]), Number(args[1]))
      return cursor([])
    }

    if (
      query === 'DELETE FROM mirror_outbox WHERE action = ? AND mirror_key = ?'
    ) {
      const action = String(args[0])
      const mirrorKey = String(args[1])
      for (const [sequence, pending] of state.mirrorOutbox) {
        if (pending.action === action && pending.mirrorKey === mirrorKey) {
          state.mirrorOutbox.delete(sequence)
        }
      }
      return cursor([])
    }
    if (
      query ===
      "DELETE FROM mirror_outbox WHERE action = 'put_key' AND mirror_key = ?"
    ) {
      const mirrorKey = String(args[0])
      for (const [sequence, pending] of state.mirrorOutbox) {
        if (pending.action === 'put_key' && pending.mirrorKey === mirrorKey) {
          state.mirrorOutbox.delete(sequence)
        }
      }
      return cursor([])
    }
    if (
      query ===
      "DELETE FROM mirror_outbox WHERE action = 'delete_key' AND mirror_key = ?"
    ) {
      const mirrorKey = String(args[0])
      for (const [sequence, pending] of state.mirrorOutbox) {
        if (pending.action === 'delete_key' && pending.mirrorKey === mirrorKey) {
          state.mirrorOutbox.delete(sequence)
        }
      }
      return cursor([])
    }
    if (query.includes('FROM mirror_outbox ORDER BY sequence LIMIT 1')) {
      const pending = [...state.mirrorOutbox.values()].sort(
        (left, right) => left.sequence - right.sequence
      )[0]
      return cursor(pending ? [{ ...pending }] : [])
    }
    if (query.startsWith('INSERT INTO mirror_outbox')) {
      const sequence = state.nextMirrorSequence++
      state.mirrorOutbox.set(sequence, {
        sequence,
        action: String(args[0]),
        mirrorKey: String(args[1]),
        valueJson: args[2] == null ? null : String(args[2]),
      })
      return cursor([])
    }
    if (query === 'DELETE FROM mirror_outbox WHERE sequence = ?') {
      state.mirrorOutbox.delete(Number(args[0]))
      return cursor([])
    }

    if (query === 'SELECT key_id AS keyId FROM retired_key') {
      return cursor([...state.retiredKeys].map(([keyId]) => ({ keyId })))
    }
    if (query === 'DELETE FROM retired_key WHERE key_id = ?') {
      state.retiredKeys.delete(String(args[0]))
      return cursor([])
    }
    if (query.startsWith('INSERT OR IGNORE INTO retired_key')) {
      if (!state.retiredKeys.has(String(args[0]))) {
        state.retiredKeys.set(String(args[0]), Number(args[1]))
      }
      return cursor([])
    }

    throw new Error(`Unexpected SQL in App Attest test: ${query}`)
  }

  return {
    id: { toString: () => 'opaque-app-attest-object-id' },
    storage: {
      sql: { exec },
      setAlarm: async (timestamp: number | Date) => {
        state.alarmAt =
          timestamp instanceof Date ? timestamp.getTime() : Number(timestamp)
      },
      transactionSync: <T>(closure: () => T): T => {
        const snapshot = cloneState(state)
        try {
          return closure()
        } catch (error) {
          restoreState(state, snapshot)
          throw error
        }
      },
    },
  } as unknown as DurableObjectState
}

interface LifecycleKv extends MemoryKv {
  list(options?: {
    prefix?: string
    cursor?: string
  }): Promise<{
    keys: Array<{ name: string }>
    list_complete: boolean
    cursor?: string
  }>
  listCalls: number
  setListPageSize(size: number): void
  failNextList(): void
  failNextPut(key: string): void
  failNextDelete(key: string): void
  holdNextPut(key: string): { entered: Promise<void>; release(): void }
}

interface Harness {
  lifecycle: ReturnType<typeof appAttestLifecycle>
  identity: AppAttestIdentityType
  kv: LifecycleKv
  state: FakeSqlState
  environment: Environment
  attestationCalls: Array<{
    keyId: string
    clientData: string
    bundleIds: readonly string[]
  }>
  assertionCalls: Array<{
    assertion: string
    clientData: string
    spki: string
    bundleId: string
  }>
  advanceTime(milliseconds: number): void
}

const harness = async (
  options: {
    additionalBundleIds?: string
    initialState?: Partial<FakeSqlState>
  } = {}
): Promise<Harness> => {
  const memoryKv = makeMemoryKv()
  let listPageSize = Number.POSITIVE_INFINITY
  let listFailures = 0
  const putFailures = new Map<string, number>()
  const deleteFailures = new Map<string, number>()
  const putHolds = new Map<
    string,
    { entered(): void; released: Promise<void> }
  >()
  const consumeFailure = (failures: Map<string, number>, key: string) => {
    const remaining = failures.get(key) ?? 0
    if (remaining === 0) return false
    if (remaining === 1) failures.delete(key)
    else failures.set(key, remaining - 1)
    return true
  }
  const kv: LifecycleKv = {
    store: memoryKv.store,
    get: memoryKv.get,
    put: async (key, value) => {
      if (consumeFailure(putFailures, key)) {
        throw new Error('injected KV put failure')
      }
      const hold = putHolds.get(key)
      if (hold) {
        hold.entered()
        await hold.released
        putHolds.delete(key)
      }
      await memoryKv.put(key, value)
    },
    delete: async (key) => {
      if (consumeFailure(deleteFailures, key)) {
        throw new Error('injected KV delete failure')
      }
      await memoryKv.delete(key)
    },
    listCalls: 0,
    list: async (options = {}) => {
      kv.listCalls += 1
      if (listFailures > 0) {
        listFailures -= 1
        throw new Error('injected KV list failure')
      }
      const prefix = options.prefix ?? ''
      const names = [...memoryKv.store.keys()]
        .filter((key) => key.startsWith(prefix))
        .sort()
      const offset = options.cursor ? Number(options.cursor) : 0
      const pageSize = Number.isFinite(listPageSize)
        ? Math.max(1, listPageSize)
        : names.length || 1
      const page = names.slice(offset, offset + pageSize)
      const nextOffset = offset + page.length
      const listComplete = nextOffset >= names.length
      return {
        keys: page.map((name) => ({ name })),
        list_complete: listComplete,
        ...(listComplete ? {} : { cursor: String(nextOffset) }),
      }
    },
    setListPageSize: (size) => {
      listPageSize = size
    },
    failNextList: () => {
      listFailures += 1
    },
    failNextPut: (key) => {
      putFailures.set(key, (putFailures.get(key) ?? 0) + 1)
    },
    failNextDelete: (key) => {
      deleteFailures.set(key, (deleteFailures.get(key) ?? 0) + 1)
    },
    holdNextPut: (key) => {
      let enter!: () => void
      let release!: () => void
      const entered = new Promise<void>((resolve) => {
        enter = resolve
      })
      const released = new Promise<void>((resolve) => {
        release = resolve
      })
      putHolds.set(key, { entered: enter, released })
      return { entered, release }
    },
  }
  const state: FakeSqlState = {
    identity: null,
    operations: new Map(),
    legacyChallenges: new Map(),
    legacyRegistrationReceipts: new Map(),
    retiredKeys: new Map(),
    mirrorOutbox: new Map(),
    nextMirrorSequence: 1,
    alarmAt: null,
    failCompleteOnce: false,
    hasBundleIdColumn: false,
    ...options.initialState,
  }
  const attestationCalls: Harness['attestationCalls'] = []
  const assertionCalls: Harness['assertionCalls'] = []
  let now = 1_800_000_000_000
  let challengeNumber = 0

  const dependencies: AppAttestIdentityDependencies = {
    now: () => now++,
    randomChallenge: () =>
      `${String.fromCharCode(65 + (challengeNumber++ % 26))}`.repeat(43),
    verifyAttestation: async (args) => {
      attestationCalls.push({
        keyId: args.keyId,
        clientData: args.clientData,
        bundleIds: args.bundleIds,
      })
      if (args.attestation === 'invalid-attestation') {
        throw new AppAttestError('synthetic attestation invalid')
      }
      // `bundle=<id>;...` models a key generated by another app's App ID.
      const bundleId =
        /^bundle=([^;]+);/.exec(args.attestation)?.[1] ?? PRIMARY_BUNDLE
      if (!args.bundleIds.includes(bundleId)) {
        throw new AppAttestError('rpIdHash mismatch (wrong app id)')
      }
      return {
        spki: `spki:${args.keyId}`,
        environment: 'development',
        bundleId,
      }
    },
    verifyAssertion: async (args) => {
      assertionCalls.push({
        assertion: args.assertion,
        clientData: args.clientData,
        spki: args.spki,
        bundleId: args.bundleId,
      })
      const match = /^count:(\d+)$/.exec(args.assertion)
      if (!match) throw new AppAttestError('synthetic assertion invalid')
      return { signCount: Number(match[1]) }
    },
  }

  const environment = {
    NOTES_KV: kv as unknown as KVNamespace,
    APPLE_TEAM_ID: 'ABCDE12345',
    IOS_BUNDLE_ID: PRIMARY_BUNDLE,
    IOS_ADDITIONAL_BUNDLE_IDS: options.additionalBundleIds,
    APP_ATTEST_ENVIRONMENT: 'development',
    NOTES_IMPORT_DEV_BYPASS_TOKEN: 'dev-only',
  } as unknown as Environment
  const { AppAttestIdentity } = await import('./identityDO')
  const identity = new AppAttestIdentity(
    fakeContext(state),
    environment,
    dependencies
  )
  environment.APP_ATTEST_IDENTITY = {
    idFromName: () => ({ toString: () => 'identity-id' }),
    get: () => identity,
  } as unknown as DurableObjectNamespace<AppAttestIdentityType>

  return {
    lifecycle: appAttestLifecycle(environment),
    identity,
    kv,
    state,
    environment,
    attestationCalls,
    assertionCalls,
    advanceTime: (milliseconds) => {
      now += milliseconds
    },
  }
}

const issue = async (
  test: Harness,
  request: Omit<V2ChallengeRequest, 'protocolVersion'>
) =>
  test.lifecycle.issueChallenge({ protocolVersion: 2, ...request }) as Promise<{
    protocolVersion: 2
    operation: 'bind' | 'enroll' | 'assert'
    operationId: string
    challenge: string
    expiresAt: number
  }>

const prepareBind = async (
  test: Harness,
  options: {
    operationId: string
    keyId?: string
    token?: string
    attestation?: string
  }
): Promise<V2BindRequest> => {
  const keyId = options.keyId ?? KEY_A
  const challenge = await issue(test, {
    operation: 'bind',
    operationId: options.operationId,
    uuid: UUID,
    keyId,
  })
  return {
    protocolVersion: 2,
    operation: 'bind',
    operationId: options.operationId,
    uuid: UUID,
    keyId,
    challenge: challenge.challenge,
    attestation: options.attestation ?? `attestation:${keyId}`,
    recoveryToken: options.token ?? TOKEN_A,
  }
}

const bind = async (
  test: Harness,
  options: Parameters<typeof prepareBind>[1]
) => {
  const request = await prepareBind(test, options)
  return { request, result: await test.lifecycle.register(request) }
}

const assertV2 = async (
  test: Harness,
  options: { operationId: string; keyId?: string; count: number }
) => {
  const keyId = options.keyId ?? KEY_A
  const challengeResult = await issue(test, {
    operation: 'assert',
    operationId: options.operationId,
    uuid: UUID,
    keyId,
    purpose: NOTES_IMPORT_VERIFY_PURPOSE,
    contentHash: CONTENT_HASH,
    requestHash: REQUEST_HASH,
  })
  const request: V2AssertionRequest = {
    protocolVersion: 2,
    operation: 'assert',
    operationId: options.operationId,
    uuid: UUID,
    keyId,
    purpose: NOTES_IMPORT_VERIFY_PURPOSE,
    challenge: challengeResult.challenge,
    assertion: `count:${options.count}`,
    contentHash: CONTENT_HASH,
    requestHash: REQUEST_HASH,
  }
  return test.lifecycle.verifyAssertion(request, {
    uuid: UUID,
    contentHash: CONTENT_HASH,
    requestHash: REQUEST_HASH,
    purpose: NOTES_IMPORT_VERIFY_PURPOSE,
  })
}

const seedLegacyKey = async (
  test: Harness,
  signCount: number,
  keyId = KEY_A,
  uuid = UUID
) => {
  await test.kv.put(
    `key:${keyId}`,
    JSON.stringify({
      spki: `legacy-spki:${keyId}`,
      signCount,
      uuid,
      environment: 'development',
      attestedAt: 123,
    })
  )
}

const seedLegacyIdentity = async (
  test: Harness,
  signCount: number,
  keyId = KEY_A
) => {
  await test.kv.put(`uuidOwner:${UUID}`, keyId)
  await seedLegacyKey(test, signCount, keyId)
}

beforeEach(() => {
  vi.restoreAllMocks()
})

describe('App Attest lifecycle module', () => {
  it('lazily imports the active legacy KV key and counter before v2 verification', async () => {
    const test = await harness()
    await seedLegacyIdentity(test, 4)

    await expect(
      assertV2(test, { operationId: 'assert-op-0001', count: 5 })
    ).resolves.toEqual({
      ok: true,
      protocolVersion: 2,
      operationId: 'assert-op-0001',
    })
    expect(test.assertionCalls[0].spki).toBe(`legacy-spki:${KEY_A}`)

    await expect(
      assertV2(test, { operationId: 'assert-op-0002', count: 5 })
    ).rejects.toMatchObject({
      reason: 'counter_not_increasing',
      action: 'start_new_operation',
    })
  })

  it('imports a presented ownerless legacy key for assertion', async () => {
    const test = await harness()
    await seedLegacyKey(test, 4)

    await expect(
      assertV2(test, { operationId: 'assert-ownerless-key', count: 5 })
    ).resolves.toMatchObject({ ok: true })
    expect(test.assertionCalls[0].spki).toBe(`legacy-spki:${KEY_A}`)
    expect(test.kv.store.get(`uuidOwner:${UUID}`)).toBe(KEY_A)
  })

  it('imports a presented ownerless legacy key for recovery enrollment', async () => {
    const test = await harness()
    await seedLegacyKey(test, 3)
    const challenge = await issue(test, {
      operation: 'enroll',
      operationId: 'enroll-ownerless-key',
      uuid: UUID,
      keyId: KEY_A,
    })
    const request: V2EnrollRequest = {
      protocolVersion: 2,
      operation: 'enroll',
      operationId: 'enroll-ownerless-key',
      uuid: UUID,
      keyId: KEY_A,
      challenge: challenge.challenge,
      assertion: 'count:4',
      recoveryToken: TOKEN_A,
    }

    await expect(test.lifecycle.register(request)).resolves.toMatchObject({
      status: 'recovery_enrolled',
      recoveryEnrolled: true,
    })
    expect(test.assertionCalls[0].spki).toBe(`legacy-spki:${KEY_A}`)
    expect(test.kv.store.get(`uuidOwner:${UUID}`)).toBe(KEY_A)
  })

  it('binds a fresh install without listing the legacy key space', async () => {
    const test = await harness()
    await seedLegacyKey(test, 1, '000-unrelated', 'different-uuid')
    test.kv.failNextList()

    const { result } = await bind(test, {
      operationId: 'bind-fresh-no-scan',
      keyId: KEY_B,
    })
    expect(result).toMatchObject({ status: 'bound', recoveryEnrolled: true })
    expect(test.kv.listCalls).toBe(0)
    expect(test.kv.store.get(`uuidOwner:${UUID}`)).toBe(KEY_B)
  })

  it('verifies a fresh bind attestation before reading legacy keys', async () => {
    const test = await harness()
    await seedLegacyKey(test, 4, KEY_A)

    await expect(
      bind(test, {
        operationId: 'bind-invalid-before-legacy-read',
        keyId: KEY_B,
        attestation: 'invalid-attestation',
      }).then(({ result }) => result)
    ).rejects.toMatchObject({
      reason: 'attestation_invalid',
      action: 'none',
    })
    expect(test.state.identity).toBeNull()
  })

  it('uses the legacy owner index without scanning all keys', async () => {
    const test = await harness()
    await seedLegacyIdentity(test, 4)
    test.kv.failNextList()

    await expect(
      assertV2(test, { operationId: 'assert-owner-fast-path', count: 5 })
    ).resolves.toMatchObject({ ok: true })
    expect(test.kv.listCalls).toBe(0)
  })

  it('replays an exact bind result after a lost response without re-attesting', async () => {
    const test = await harness()
    const first = await bind(test, { operationId: 'bind-op-0001' })

    await expect(test.lifecycle.register(first.request)).resolves.toEqual(
      first.result
    )
    await expect(
      issue(test, {
        operation: 'bind',
        operationId: 'bind-op-0001',
        uuid: UUID,
        keyId: KEY_A,
      })
    ).resolves.toMatchObject({ challenge: first.request.challenge })
    expect(first.result).toMatchObject({ status: 'bound', recoveryEnrolled: true })
    expect(test.attestationCalls).toHaveLength(1)
  })

  it('persists and retries initial owner mirror writes before acknowledging bind', async () => {
    const test = await harness()
    const request = await prepareBind(test, {
      operationId: 'bind-mirror-owner-failure',
    })
    test.kv.failNextPut(`uuidOwner:${UUID}`)

    await expect(test.lifecycle.register(request)).rejects.toMatchObject({
      reason: 'storage_unavailable',
      action: 'retry',
    })
    expect(test.kv.store.has(`uuidOwner:${UUID}`)).toBe(false)
    expect(test.kv.store.has(`key:${KEY_A}`)).toBe(false)
    expect(test.state.alarmAt).not.toBeNull()

    await test.identity.alarm()
    expect(test.kv.store.get(`uuidOwner:${UUID}`)).toBe(KEY_A)
    expect(test.kv.store.has(`key:${KEY_A}`)).toBe(true)

    await expect(test.lifecycle.register(request)).resolves.toMatchObject({
      status: 'bound',
    })
    expect(test.kv.store.get(`uuidOwner:${UUID}`)).toBe(KEY_A)
    expect(test.kv.store.has(`key:${KEY_A}`)).toBe(true)
    expect(test.attestationCalls).toHaveLength(1)
  })

  it('persists and retries initial active-key mirror writes before acknowledging bind', async () => {
    const test = await harness()
    const request = await prepareBind(test, {
      operationId: 'bind-mirror-key-failure',
    })
    test.kv.failNextPut(`key:${KEY_A}`)

    await expect(test.lifecycle.register(request)).rejects.toMatchObject({
      reason: 'storage_unavailable',
      action: 'retry',
    })
    expect(test.kv.store.get(`uuidOwner:${UUID}`)).toBe(KEY_A)
    expect(test.kv.store.has(`key:${KEY_A}`)).toBe(false)

    await expect(
      issue(test, {
        operation: 'bind',
        operationId: 'bind-after-pending-mirror',
        uuid: UUID,
        keyId: KEY_A,
      })
    ).resolves.toMatchObject({ operationId: 'bind-after-pending-mirror' })
    expect(test.kv.store.has(`key:${KEY_A}`)).toBe(true)

    await expect(test.lifecycle.register(request)).resolves.toMatchObject({
      status: 'bound',
    })
    expect(test.kv.store.has(`key:${KEY_A}`)).toBe(true)
    expect(test.attestationCalls).toHaveLength(1)
  })

  it('serializes concurrent mirror drains so stale writes cannot win', async () => {
    const test = await harness()
    const first = await prepareBind(test, {
      operationId: 'bind-concurrent-mirror-first',
      keyId: KEY_A,
      token: TOKEN_A,
    })
    const second = await prepareBind(test, {
      operationId: 'bind-concurrent-mirror-second',
      keyId: KEY_B,
      token: TOKEN_A,
    })
    const held = test.kv.holdNextPut(`uuidOwner:${UUID}`)

    const firstResult = test.lifecycle.register(first)
    await held.entered
    const secondResult = test.lifecycle.register(second)
    await Promise.resolve()

    expect(test.attestationCalls).toHaveLength(1)
    expect(test.kv.store.has(`uuidOwner:${UUID}`)).toBe(false)

    held.release()
    await expect(firstResult).resolves.toMatchObject({ status: 'bound' })
    await expect(secondResult).resolves.toMatchObject({ status: 'rotated' })
    expect(test.kv.store.get(`uuidOwner:${UUID}`)).toBe(KEY_B)
    expect(test.kv.store.has(`key:${KEY_A}`)).toBe(false)
    expect(test.kv.store.has(`key:${KEY_B}`)).toBe(true)
    expect(test.state.mirrorOutbox.size).toBe(0)
  })

  it('deletes a retired key before publishing rotation and retries exact replay', async () => {
    const test = await harness()
    await bind(test, { operationId: 'bind-before-mirror-rotation' })
    const request = await prepareBind(test, {
      operationId: 'bind-mirror-rotation',
      keyId: KEY_B,
      token: TOKEN_A,
    })
    test.kv.failNextDelete(`key:${KEY_A}`)

    await expect(test.lifecycle.register(request)).rejects.toMatchObject({
      reason: 'storage_unavailable',
      action: 'retry',
    })
    expect(test.kv.store.get(`uuidOwner:${UUID}`)).toBe(KEY_A)
    expect(test.kv.store.has(`key:${KEY_A}`)).toBe(true)
    expect(test.kv.store.has(`key:${KEY_B}`)).toBe(false)

    await expect(test.lifecycle.register(request)).resolves.toMatchObject({
      status: 'rotated',
    })
    expect(test.kv.store.get(`uuidOwner:${UUID}`)).toBe(KEY_B)
    expect(test.kv.store.has(`key:${KEY_A}`)).toBe(false)
    expect(test.kv.store.has(`key:${KEY_B}`)).toBe(true)
    expect(test.state.retiredKeys.size).toBe(0)
    expect(test.state.mirrorOutbox.size).toBe(0)
    expect(test.attestationCalls).toHaveLength(2)
  })

  it('keeps enrollment counters authoritative in SQLite without rewriting KV', async () => {
    const test = await harness()
    await bind(test, { operationId: 'bind-before-mirror-enroll' })
    const challenge = await issue(test, {
      operation: 'enroll',
      operationId: 'enroll-mirror-key-failure',
      uuid: UUID,
      keyId: KEY_A,
    })
    const request: V2EnrollRequest = {
      protocolVersion: 2,
      operation: 'enroll',
      operationId: 'enroll-mirror-key-failure',
      uuid: UUID,
      keyId: KEY_A,
      challenge: challenge.challenge,
      assertion: 'count:1',
      recoveryToken: TOKEN_A,
    }
    test.kv.failNextPut(`key:${KEY_A}`)

    await expect(test.lifecycle.register(request)).resolves.toMatchObject({
      status: 'recovery_enrolled',
    })
    expect(test.assertionCalls).toHaveLength(1)
    expect(
      JSON.parse(test.kv.store.get(`key:${KEY_A}`) ?? '{}').signCount
    ).toBe(0)
  })

  it('keeps protected v2 counters in SQLite without same-key KV writes', async () => {
    const test = await harness()
    await bind(test, { operationId: 'bind-before-no-counter-mirror' })
    test.kv.failNextPut(`key:${KEY_A}`)

    await expect(
      assertV2(test, { operationId: 'assert-no-counter-mirror', count: 1 })
    ).resolves.toMatchObject({ ok: true })
    expect(test.state.identity?.signCount).toBe(1)
    expect(
      JSON.parse(test.kv.store.get(`key:${KEY_A}`) ?? '{}').signCount
    ).toBe(0)
    expect(test.state.mirrorOutbox.size).toBe(0)
  })

  it('carries requestHash through the lifecycle seam and rejects mutation', async () => {
    const test = await harness()
    await bind(test, { operationId: 'bind-before-request-hash' })
    const challenge = await issue(test, {
      operation: 'assert',
      operationId: 'assert-request-hash',
      uuid: UUID,
      keyId: KEY_A,
      purpose: NOTES_IMPORT_VERIFY_PURPOSE,
      contentHash: CONTENT_HASH,
      requestHash: REQUEST_HASH,
    })
    const request: V2AssertionRequest = {
      protocolVersion: 2,
      operation: 'assert',
      operationId: 'assert-request-hash',
      uuid: UUID,
      keyId: KEY_A,
      purpose: NOTES_IMPORT_VERIFY_PURPOSE,
      challenge: challenge.challenge,
      assertion: 'count:1',
      contentHash: CONTENT_HASH,
      requestHash: REQUEST_HASH,
    }
    const binding = {
      uuid: UUID,
      contentHash: CONTENT_HASH,
      requestHash: REQUEST_HASH,
      purpose: NOTES_IMPORT_VERIFY_PURPOSE,
    } as const

    await expect(
      test.lifecycle.verifyAssertion(
        { ...request, requestHash: 'e'.repeat(64) },
        binding
      )
    ).rejects.toMatchObject({ reason: 'invalid_request', action: 'none' })
    expect(test.assertionCalls).toHaveLength(0)

    await expect(
      test.lifecycle.verifyAssertion(request, binding)
    ).resolves.toMatchObject({ ok: true, operationId: 'assert-request-hash' })
    expect(test.assertionCalls[0].clientData).toBe(
      `witnesswork.app-attest|2|assert|notes-import-verify|assert-request-hash|${challenge.challenge}|${UUID}||${CONTENT_HASH}|${REQUEST_HASH}`
    )
  })

  it('treats a completed v2 assertion as one-time authorization at the DO seam', async () => {
    const test = await harness()
    await bind(test, { operationId: 'bind-op-0001' })
    const challengeResult = await test.identity.issueChallenge({
      protocolVersion: 2,
      operation: 'assert',
      operationId: 'assert-op-one-time',
      uuid: UUID,
      keyId: KEY_A,
      purpose: NOTES_IMPORT_VERIFY_PURPOSE,
      contentHash: CONTENT_HASH,
      requestHash: REQUEST_HASH,
    })
    expect(challengeResult.ok).toBe(true)
    if (!challengeResult.ok) throw new Error('challenge setup failed')

    const request: V2AssertionRequest = {
      protocolVersion: 2,
      operation: 'assert',
      operationId: 'assert-op-one-time',
      uuid: UUID,
      keyId: KEY_A,
      purpose: NOTES_IMPORT_VERIFY_PURPOSE,
      challenge: challengeResult.value.challenge,
      assertion: 'count:1',
      contentHash: CONTENT_HASH,
      requestHash: REQUEST_HASH,
    }

    await expect(test.identity.verifyAssertion(request)).resolves.toEqual({
      ok: true,
      value: {
        ok: true,
        protocolVersion: 2,
        operationId: 'assert-op-one-time',
      },
    })
    await expect(test.identity.verifyAssertion(request)).resolves.toMatchObject({
      ok: false,
      error: {
        reason: 'challenge_not_found',
        action: 'start_new_operation',
      },
    })
    expect(test.assertionCalls).toHaveLength(1)
  })

  it('never resets the active counter during same-key registration', async () => {
    const test = await harness()
    await bind(test, { operationId: 'bind-op-0001' })
    await assertV2(test, { operationId: 'assert-op-0001', count: 8 })

    await expect(
      bind(test, { operationId: 'bind-op-0002' }).then(({ result }) => result)
    ).resolves.toMatchObject({ status: 'already_bound' })
    await expect(
      assertV2(test, { operationId: 'assert-op-0002', count: 8 })
    ).rejects.toMatchObject({
      reason: 'counter_not_increasing',
      action: 'start_new_operation',
    })
  })

  it('keeps v1 assertions fail-closed for unknown, wrong-UUID, and wrong-key records', async () => {
    const binding = {
      uuid: UUID,
      contentHash: CONTENT_HASH,
      purpose: NOTES_IMPORT_VERIFY_PURPOSE,
    } as const

    const unknown = await harness()
    await unknown.kv.put('chal:v1-unknown-key', '1')
    await expect(
      unknown.lifecycle.verifyAssertion(
        {
          uuid: UUID,
          keyId: KEY_A,
          challenge: 'v1-unknown-key',
          assertion: 'count:1',
          contentHash: CONTENT_HASH,
        },
        binding
      )
    ).rejects.toMatchObject({ reason: 'identity_not_bound', action: 'bind' })

    const wrongUuid = await harness()
    await seedLegacyKey(wrongUuid, 0, KEY_A, 'different-uuid')
    await wrongUuid.kv.put('chal:v1-wrong-uuid', '1')
    await expect(
      wrongUuid.lifecycle.verifyAssertion(
        {
          uuid: UUID,
          keyId: KEY_A,
          challenge: 'v1-wrong-uuid',
          assertion: 'count:1',
          contentHash: CONTENT_HASH,
        },
        binding
      )
    ).rejects.toMatchObject({ reason: 'identity_not_bound', action: 'bind' })

    const wrongKey = await harness()
    await seedLegacyIdentity(wrongKey, 0)
    await wrongKey.kv.put('chal:v1-wrong-key', '1')
    await expect(
      wrongKey.lifecycle.verifyAssertion(
        {
          uuid: UUID,
          keyId: KEY_B,
          challenge: 'v1-wrong-key',
          assertion: 'count:1',
          contentHash: CONTENT_HASH,
        },
        binding
      )
    ).rejects.toMatchObject({
      reason: 'key_not_active',
      action: 'use_active_key',
    })
  })

  it('consumes a successful v1 assertion challenge exactly once', async () => {
    const test = await harness()
    await seedLegacyIdentity(test, 0)
    await test.kv.put('chal:v1-assertion-replay', '1')
    const request = {
      uuid: UUID,
      keyId: KEY_A,
      challenge: 'v1-assertion-replay',
      assertion: 'count:1',
      contentHash: CONTENT_HASH,
    }
    const binding = {
      uuid: UUID,
      contentHash: CONTENT_HASH,
      purpose: NOTES_IMPORT_VERIFY_PURPOSE,
    } as const

    await expect(test.lifecycle.verifyAssertion(request, binding)).resolves.toEqual({
      ok: true,
    })
    await expect(test.lifecycle.verifyAssertion(request, binding)).rejects.toMatchObject({
      reason: 'challenge_not_found',
      action: 'start_new_operation',
    })
    expect(test.assertionCalls).toHaveLength(1)
  })

  it('recovers safe v1 partial owner/key state without allowing takeover', async () => {
    const ownerOnly = await harness()
    await ownerOnly.kv.put(`uuidOwner:${UUID}`, KEY_A)
    await ownerOnly.kv.put('chal:v1-partial-owner', '1')
    await expect(
      ownerOnly.lifecycle.register({
        uuid: UUID,
        keyId: KEY_A,
        challenge: 'v1-partial-owner',
        attestation: 'v1-partial-attestation',
      })
    ).resolves.toEqual({ ok: true })
    expect(ownerOnly.kv.store.has(`key:${KEY_A}`)).toBe(true)

    const ownerOnlyAttack = await harness()
    await ownerOnlyAttack.kv.put(`uuidOwner:${UUID}`, KEY_A)
    await ownerOnlyAttack.kv.put('chal:v1-partial-owner-attack', '1')
    await expect(
      ownerOnlyAttack.lifecycle.register({
        uuid: UUID,
        keyId: KEY_B,
        challenge: 'v1-partial-owner-attack',
        attestation: 'v1-partial-attestation',
      })
    ).rejects.toMatchObject({
      reason: 'key_not_active',
      action: 'use_active_key',
    })
    expect(ownerOnlyAttack.kv.store.has(`key:${KEY_B}`)).toBe(false)

    const keyOnly = await harness()
    await seedLegacyKey(keyOnly, 2)
    await keyOnly.kv.put('chal:v1-partial-key', '1')
    await expect(
      keyOnly.lifecycle.verifyAssertion(
        {
          uuid: UUID,
          keyId: KEY_A,
          challenge: 'v1-partial-key',
          assertion: 'count:3',
          contentHash: CONTENT_HASH,
        },
        {
          uuid: UUID,
          contentHash: CONTENT_HASH,
          purpose: NOTES_IMPORT_VERIFY_PURPOSE,
        }
      )
    ).resolves.toEqual({ ok: true })
    expect(keyOnly.kv.store.get(`uuidOwner:${UUID}`)).toBe(KEY_A)
  })

  it('replays only the exact committed v1 registration after response loss', async () => {
    const test = await harness()
    await test.kv.put('chal:v1-registration-replay', '1')
    const request = {
      protocolVersion: 1 as const,
      uuid: UUID,
      keyId: KEY_A,
      challenge: 'v1-registration-replay',
      attestation: 'v1-attestation',
    }

    await expect(test.lifecycle.register(request)).resolves.toEqual({ ok: true })
    await expect(test.lifecycle.register(request)).resolves.toEqual({ ok: true })
    expect(test.attestationCalls).toHaveLength(1)

    const nonidenticalRequests = [
      { ...request, uuid: `X${UUID.slice(1)}` },
      { ...request, keyId: KEY_B },
      { ...request, challenge: 'different-v1-challenge' },
      { ...request, attestation: 'different-v1-attestation' },
    ]
    for (const nonidentical of nonidenticalRequests) {
      await expect(test.lifecycle.register(nonidentical)).rejects.toMatchObject({
        reason: 'challenge_not_found',
        action: 'start_new_operation',
      })
    }
    expect(test.attestationCalls).toHaveLength(1)
  })

  it('uses the v1 receipt to finish a failed initial mirror on exact replay', async () => {
    const test = await harness()
    await test.kv.put('chal:v1-registration-mirror-replay', '1')
    const request = {
      uuid: UUID,
      keyId: KEY_A,
      challenge: 'v1-registration-mirror-replay',
      attestation: 'v1-attestation',
    }
    test.kv.failNextPut(`uuidOwner:${UUID}`)

    await expect(test.lifecycle.register(request)).rejects.toMatchObject({
      reason: 'storage_unavailable',
      action: 'retry',
    })
    await expect(test.lifecycle.register(request)).resolves.toEqual({ ok: true })
    expect(test.attestationCalls).toHaveLength(1)
    expect(test.kv.store.get(`uuidOwner:${UUID}`)).toBe(KEY_A)
    expect(test.kv.store.has(`key:${KEY_A}`)).toBe(true)
  })

  it('preserves a migrated counter during deployed v1 same-key registration', async () => {
    const test = await harness()
    await seedLegacyIdentity(test, 8)
    await test.kv.put('chal:legacy-challenge', '1')

    await expect(
      test.lifecycle.register({
        uuid: UUID,
        keyId: KEY_A,
        challenge: 'legacy-challenge',
        attestation: 'legacy-attestation',
      })
    ).resolves.toEqual({ ok: true })
    await expect(
      assertV2(test, { operationId: 'assert-op-after-v1', count: 8 })
    ).rejects.toMatchObject({
      reason: 'counter_not_increasing',
      action: 'start_new_operation',
    })
  })

  it('enrolls a recovery token with the legacy active key and accepts it for rotation', async () => {
    const test = await harness()
    await seedLegacyIdentity(test, 3)
    const challenge = await issue(test, {
      operation: 'enroll',
      operationId: 'enroll-op-0001',
      uuid: UUID,
      keyId: KEY_A,
    })
    const request: V2EnrollRequest = {
      protocolVersion: 2,
      operation: 'enroll',
      operationId: 'enroll-op-0001',
      uuid: UUID,
      keyId: KEY_A,
      challenge: challenge.challenge,
      assertion: 'count:4',
      recoveryToken: TOKEN_A,
    }

    await expect(test.lifecycle.register(request)).resolves.toMatchObject({
      status: 'recovery_enrolled',
      recoveryEnrolled: true,
    })
    await expect(
      bind(test, {
        operationId: 'bind-op-rotation',
        keyId: KEY_B,
        token: TOKEN_A,
      }).then(({ result }) => result)
    ).resolves.toMatchObject({ status: 'rotated' })
  })

  it('fails closed and replays the same result for a wrong recovery token', async () => {
    const test = await harness()
    await bind(test, { operationId: 'bind-op-0001', token: TOKEN_A })
    const challenge = await issue(test, {
      operation: 'bind',
      operationId: 'bind-op-wrong-token',
      uuid: UUID,
      keyId: KEY_B,
    })
    const request: V2BindRequest = {
      protocolVersion: 2,
      operation: 'bind',
      operationId: 'bind-op-wrong-token',
      uuid: UUID,
      keyId: KEY_B,
      challenge: challenge.challenge,
      attestation: `attestation:${KEY_B}`,
      recoveryToken: TOKEN_B,
    }

    await expect(test.lifecycle.register(request)).rejects.toMatchObject({
      reason: 'recovery_token_mismatch',
    })
    await expect(test.lifecycle.register(request)).rejects.toMatchObject({
      reason: 'recovery_token_mismatch',
    })
    await expect(
      test.lifecycle.register({ ...request, recoveryToken: TOKEN_A })
    ).rejects.toMatchObject({ reason: 'operation_conflict' })
    // Verify Apple before revealing token policy; replay does not re-attest.
    expect(test.attestationCalls).toHaveLength(2)
    await expect(
      assertV2(test, { operationId: 'assert-op-active', keyId: KEY_A, count: 1 })
    ).resolves.toMatchObject({ ok: true })
  })

  it('rejects the superseded key after a recovery rotation', async () => {
    const test = await harness()
    await bind(test, { operationId: 'bind-op-0001' })
    await bind(test, {
      operationId: 'bind-op-rotation',
      keyId: KEY_B,
      token: TOKEN_A,
    })
    expect(test.kv.store.has(`key:${KEY_A}`)).toBe(false)
    expect(test.kv.store.get(`uuidOwner:${UUID}`)).toBe(KEY_B)

    await expect(
      assertV2(test, { operationId: 'assert-op-old-key', keyId: KEY_A, count: 1 })
    ).rejects.toMatchObject({
      reason: 'key_not_active',
      action: 'use_active_key',
    })
    await expect(
      assertV2(test, { operationId: 'assert-op-new-key', keyId: KEY_B, count: 1 })
    ).resolves.toMatchObject({ ok: true })
  })

  it('rejects changed challenge and completion payloads under the same operationId', async () => {
    const test = await harness()
    await issue(test, {
      operation: 'bind',
      operationId: 'bind-op-conflict',
      uuid: UUID,
      keyId: KEY_A,
    })

    await expect(
      issue(test, {
        operation: 'bind',
        operationId: 'bind-op-conflict',
        uuid: UUID,
        keyId: KEY_B,
      })
    ).rejects.toMatchObject({ reason: 'operation_conflict' })

    const completed = await bind(test, { operationId: 'bind-op-completion' })
    await expect(
      test.lifecycle.register({
        ...completed.request,
        attestation: 'different-attestation',
      })
    ).rejects.toMatchObject({ reason: 'operation_conflict' })
  })

  it('expires an existing incomplete challenge instead of returning stale authorization', async () => {
    const test = await harness()
    const first = await issue(test, {
      operation: 'bind',
      operationId: 'bind-op-expired',
      uuid: UUID,
      keyId: KEY_A,
    })
    test.advanceTime(APP_ATTEST_CHALLENGE_TTL_SECONDS * 1000 + 1)

    await expect(
      issue(test, {
        operation: 'bind',
        operationId: 'bind-op-expired',
        uuid: UUID,
        keyId: KEY_A,
      })
    ).rejects.toMatchObject({
      reason: 'challenge_expired',
      action: 'start_new_operation',
    })

    const replacement = await issue(test, {
      operation: 'bind',
      operationId: 'bind-op-expired',
      uuid: UUID,
      keyId: KEY_A,
    })
    expect(replacement.challenge).not.toBe(first.challenge)
  })

  it('garbage-collects expired operations before enforcing the active cap', async () => {
    const test = await harness()
    let firstChallenge = ''
    for (let index = 0; index < 32; index += 1) {
      const challenge = await issue(test, {
        operation: 'bind',
        operationId: `bind-cap-${String(index).padStart(3, '0')}`,
        uuid: UUID,
        keyId: KEY_A,
      })
      if (index === 0) firstChallenge = challenge.challenge
    }

    await expect(
      issue(test, {
        operation: 'bind',
        operationId: 'bind-cap-overflow',
        uuid: UUID,
        keyId: KEY_A,
      })
    ).rejects.toMatchObject({ reason: 'too_many_challenges', action: 'retry' })

    test.advanceTime(APP_ATTEST_CHALLENGE_TTL_SECONDS * 1000 + 1)
    await expect(
      issue(test, {
        operation: 'bind',
        operationId: 'bind-cap-after-gc',
        uuid: UUID,
        keyId: KEY_A,
      })
    ).resolves.toMatchObject({ operationId: 'bind-cap-after-gc' })

    const recycled = await issue(test, {
      operation: 'bind',
      operationId: 'bind-cap-000',
      uuid: UUID,
      keyId: KEY_A,
    })
    expect(recycled.challenge).not.toBe(firstChallenge)
  })

  it('expires old completed receipts while retaining recent registration replay', async () => {
    const test = await harness()
    const old = await bind(test, { operationId: 'bind-receipt-old' })
    test.advanceTime(24 * 60 * 60 * 1000 + 1)
    const recent = await bind(test, { operationId: 'bind-receipt-recent' })

    await expect(test.lifecycle.register(old.request)).rejects.toMatchObject({
      reason: 'challenge_not_found',
      action: 'start_new_operation',
    })
    await expect(test.lifecycle.register(recent.request)).resolves.toEqual(
      recent.result
    )
  })

  it('bounds completed receipts while preserving a substantial replay window', async () => {
    const test = await harness()
    const requests: V2BindRequest[] = []
    for (let index = 0; index < 260; index += 1) {
      const completed = await bind(test, {
        operationId: `bind-receipt-${String(index).padStart(4, '0')}`,
      })
      requests.push(completed.request)
    }

    await expect(test.lifecycle.register(requests[0])).rejects.toMatchObject({
      reason: 'challenge_not_found',
      action: 'start_new_operation',
    })
    await expect(test.lifecycle.register(requests[10])).resolves.toMatchObject({
      status: 'already_bound',
    })
    await expect(test.lifecycle.register(requests[259])).resolves.toMatchObject({
      status: 'already_bound',
    })
  })

  it('bounds legacy challenge and registration replay receipts', async () => {
    const test = await harness()
    for (let index = 0; index < 260; index += 1) {
      const challenge = `legacy-cap-${String(index).padStart(4, '0')}`
      await test.kv.put(`chal:${challenge}`, '1')
      await test.lifecycle.register({
        uuid: UUID,
        keyId: KEY_A,
        challenge,
        attestation: `legacy-attestation-${index}`,
      })
    }

    expect(test.state.legacyChallenges.size).toBe(256)
    expect(test.state.legacyRegistrationReceipts.size).toBe(256)
  })

  it('atomically commits challenge consumption and the assertion counter', async () => {
    const test = await harness()
    await bind(test, { operationId: 'bind-op-0001' })
    const challengeResult = await test.identity.issueChallenge({
      protocolVersion: 2,
      operation: 'assert',
      operationId: 'assert-op-atomic',
      uuid: UUID,
      keyId: KEY_A,
      purpose: NOTES_IMPORT_VERIFY_PURPOSE,
      contentHash: CONTENT_HASH,
      requestHash: REQUEST_HASH,
    })
    if (!challengeResult.ok) throw new Error('challenge setup failed')
    const request: V2AssertionRequest = {
      protocolVersion: 2,
      operation: 'assert',
      operationId: 'assert-op-atomic',
      uuid: UUID,
      keyId: KEY_A,
      purpose: NOTES_IMPORT_VERIFY_PURPOSE,
      challenge: challengeResult.value.challenge,
      assertion: 'count:1',
      contentHash: CONTENT_HASH,
      requestHash: REQUEST_HASH,
    }

    test.state.failCompleteOnce = true
    await expect(test.identity.verifyAssertion(request)).rejects.toThrow(
      'injected completion write failure'
    )
    expect(
      JSON.parse(test.kv.store.get(`key:${KEY_A}`) ?? '{}').signCount
    ).toBe(0)
    await expect(test.identity.verifyAssertion(request)).resolves.toEqual({
      ok: true,
      value: {
        ok: true,
        protocolVersion: 2,
        operationId: 'assert-op-atomic',
      },
    })
    await expect(test.identity.verifyAssertion(request)).resolves.toMatchObject({
      ok: false,
      error: {
        reason: 'challenge_not_found',
        action: 'start_new_operation',
      },
    })
    expect(test.assertionCalls).toHaveLength(2)
  })
})

describe('App Attest bundle binding', () => {
  const betaAttestation = (keyId: string) =>
    `bundle=${BETA_BUNDLE};attestation:${keyId}`

  it('accepts an attestation from an additional bundle and binds the key to it', async () => {
    const test = await harness({ additionalBundleIds: ` ${BETA_BUNDLE} ,` })

    await expect(
      bind(test, {
        operationId: 'bind-beta-0001',
        attestation: betaAttestation(KEY_A),
      }).then(({ result }) => result)
    ).resolves.toMatchObject({ status: 'bound' })
    expect(test.attestationCalls[0].bundleIds).toEqual([
      PRIMARY_BUNDLE,
      BETA_BUNDLE,
    ])
    expect(test.state.identity?.bundleId).toBe(BETA_BUNDLE)
    expect(JSON.parse(test.kv.store.get(`key:${KEY_A}`)!)).toMatchObject({
      bundleId: BETA_BUNDLE,
    })

    await expect(
      assertV2(test, { operationId: 'assert-beta-0001', count: 1 })
    ).resolves.toMatchObject({ ok: true })
    expect(test.assertionCalls.map(({ bundleId }) => bundleId)).toEqual([
      BETA_BUNDLE,
    ])
  })

  it('binds primary-bundle keys to the primary bundle, never the additional one', async () => {
    const test = await harness({ additionalBundleIds: BETA_BUNDLE })

    await bind(test, { operationId: 'bind-primary-01' })
    expect(test.state.identity?.bundleId).toBe(PRIMARY_BUNDLE)
    await assertV2(test, { operationId: 'assert-primary-1', count: 1 })
    expect(test.assertionCalls[0].bundleId).toBe(PRIMARY_BUNDLE)
  })

  it('rejects attestations from bundles that are not accepted', async () => {
    const withoutBeta = await harness()
    await expect(
      bind(withoutBeta, {
        operationId: 'bind-unknown-01',
        attestation: betaAttestation(KEY_A),
      }).then(({ result }) => result)
    ).rejects.toMatchObject({ reason: 'attestation_invalid' })
    expect(withoutBeta.state.identity).toBeNull()

    const withBeta = await harness({ additionalBundleIds: BETA_BUNDLE })
    await expect(
      bind(withBeta, {
        operationId: 'bind-unknown-02',
        attestation: `bundle=com.example.other;attestation:${KEY_A}`,
      }).then(({ result }) => result)
    ).rejects.toMatchObject({ reason: 'attestation_invalid' })
    expect(withBeta.state.identity).toBeNull()
  })

  it('fails closed when a bound additional bundle is later removed from config', async () => {
    const test = await harness({ additionalBundleIds: BETA_BUNDLE })
    await bind(test, {
      operationId: 'bind-beta-0002',
      attestation: betaAttestation(KEY_A),
    })
    test.environment.IOS_ADDITIONAL_BUNDLE_IDS = undefined

    await expect(
      assertV2(test, { operationId: 'assert-removed-1', count: 1 })
    ).rejects.toMatchObject({ reason: 'assertion_invalid' })
    expect(test.assertionCalls).toHaveLength(0)
  })

  it('verifies legacy KV keys without a stored bundle against the primary bundle', async () => {
    const test = await harness({ additionalBundleIds: BETA_BUNDLE })
    await seedLegacyIdentity(test, 4)

    await expect(
      assertV2(test, { operationId: 'assert-legacy-01', count: 5 })
    ).resolves.toMatchObject({ ok: true })
    expect(test.assertionCalls[0].bundleId).toBe(PRIMARY_BUNDLE)
    expect(test.state.identity?.bundleId).toBeNull()
  })

  it('migrates a pre-binding SQLite identity and verifies it against the primary bundle', async () => {
    const test = await harness({
      additionalBundleIds: BETA_BUNDLE,
      initialState: {
        hasBundleIdColumn: false,
        identity: {
          uuid: UUID,
          keyId: KEY_A,
          spki: `spki:${KEY_A}`,
          signCount: 2,
          environment: 'production',
          attestedAt: 1,
          recoveryVerifier: null,
          bundleId: null,
        },
      },
    })
    expect(test.state.hasBundleIdColumn).toBe(true)

    await expect(
      assertV2(test, { operationId: 'assert-premigr-1', count: 3 })
    ).resolves.toMatchObject({ ok: true })
    expect(test.assertionCalls[0].bundleId).toBe(PRIMARY_BUNDLE)
  })

  it('rebinds the bundle when a recovery rotation attests a key from another app', async () => {
    const test = await harness({ additionalBundleIds: BETA_BUNDLE })
    await bind(test, { operationId: 'bind-rotate-001', token: TOKEN_A })
    expect(test.state.identity?.bundleId).toBe(PRIMARY_BUNDLE)

    await expect(
      bind(test, {
        operationId: 'bind-rotate-002',
        keyId: KEY_B,
        token: TOKEN_A,
        attestation: betaAttestation(KEY_B),
      }).then(({ result }) => result)
    ).resolves.toMatchObject({ status: 'rotated' })
    expect(test.state.identity?.bundleId).toBe(BETA_BUNDLE)

    await assertV2(test, {
      operationId: 'assert-rotate-01',
      keyId: KEY_B,
      count: 1,
    })
    expect(test.assertionCalls.at(-1)?.bundleId).toBe(BETA_BUNDLE)
  })

  it('binds deployed v1 registrations to the attested bundle', async () => {
    const test = await harness({ additionalBundleIds: BETA_BUNDLE })
    await test.kv.put('chal:beta-legacy-challenge', '1')

    await expect(
      test.lifecycle.register({
        uuid: UUID,
        keyId: KEY_A,
        challenge: 'beta-legacy-challenge',
        attestation: betaAttestation(KEY_A),
      })
    ).resolves.toEqual({ ok: true })
    expect(test.state.identity?.bundleId).toBe(BETA_BUNDLE)
  })
})
