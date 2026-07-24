import { createHash } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import {
  createNotesImportAppAttest,
  NotesImportAppAttestHttpError,
  type AppAttestNativeFailureCode,
  type NotesImportAppAttestDependencies,
  type NotesImportAppAttestEndpoint,
} from '@/features/notes-import/lib/notesImportAppAttest'

const CONTENT_HASH = 'a'.repeat(64)
const REQUEST_CONTEXT = {
  now: '2026-07-23T09:30:00-05:00',
  timeZone: 'America/Chicago',
  existingContacts: [],
  existingCategories: [],
}
const REQUEST_PAYLOAD = {
  notesText: 'private notes',
  context: REQUEST_CONTEXT,
}
const CANONICAL_REQUEST =
  '{"context":{"existingCategories":[],"existingContacts":[],"now":"2026-07-23T09:30:00-05:00","timeZone":"America/Chicago"},"notesText":"private notes","refinement":null}'
const REQUEST_HASH =
  'bb0144cb1d8cea15751940db290a90e67bef4695233992418b3a293df7c109cc'
const RECOVERY_TOKEN_HASH = 'b'.repeat(43)
const DIAGNOSTIC_HASH =
  'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'

type PostCall = {
  endpoint: NotesImportAppAttestEndpoint
  body: Record<string, unknown>
  headers?: Record<string, string>
  signal?: AbortSignal
}

interface HarnessOptions {
  protocolVersion?: 1 | 2
  activeKeyId?: string | null
  recoveryToken?: string | null
  recoveryEnrollmentKeyId?: string | null
  recoveryStorageSupported?: boolean
  legacyKeyId?: string | null
  uuid?: string | null
  devBypass?: boolean
  getStatus?: () => Promise<unknown>
  post?: (call: PostCall, callIndex: number) => Promise<unknown> | unknown
  generateKey?: () => Promise<string>
  attestKey?: (keyId: string, hash: string) => Promise<string>
  generateAssertion?: (keyId: string, hash: string) => Promise<string>
  classifyError?: (error: unknown) => AppAttestNativeFailureCode | null
  sha256Hex?: (value: string) => Promise<string>
  now?: () => number
}

const createHarness = (options: HarnessOptions = {}) => {
  const activeKeyId = options.activeKeyId ?? null
  const legacyKeyId =
    options.legacyKeyId === undefined ? null : options.legacyKeyId
  const enrolledKeyId = activeKeyId ?? legacyKeyId
  const secure = {
    activeKeyId,
    recoveryToken: options.recoveryToken ?? null,
    recoveryEnrollmentKeyId:
      options.recoveryEnrollmentKeyId === undefined
        ? options.recoveryToken && enrolledKeyId
          ? `${enrolledKeyId}|${RECOVERY_TOKEN_HASH}`
          : null
        : options.recoveryEnrollmentKeyId,
  }
  const persisted = {
    journal: null as string | null,
    legacyKeyId,
  }
  const identity = {
    uuid: options.uuid === undefined ? 'install-uuid' : options.uuid,
  }
  const posts: PostCall[] = []
  const events: string[] = []
  const hashedClientData: string[] = []
  const hashedRequestData: string[] = []
  const recoveryTokensHashed: string[] = []
  let operation = 0
  let challenge = 0

  const getOrCreateRecoveryToken = vi.fn(() => {
    secure.recoveryToken ??= 'recovery-token'
    return secure.recoveryToken
  })
  const generateKey = vi.fn(
    options.generateKey ?? (async () => `generated-key-${operation}`)
  )
  const attestKey = vi.fn(options.attestKey ?? (async () => 'attestation'))
  const generateAssertion = vi.fn(
    options.generateAssertion ?? (async () => 'assertion')
  )

  const dependencies: NotesImportAppAttestDependencies = {
    appAttest: {
      isSupported: () => true,
      generateKey,
      attestKey,
      generateAssertion,
      classifyError: options.classifyError ?? (() => null),
    },
    secureStore: {
      supportsRecoveryStorage: () => options.recoveryStorageSupported ?? true,
      readActiveKeyId: () => secure.activeKeyId,
      writeActiveKeyId: (keyId) => {
        secure.activeKeyId = keyId
      },
      readRecoveryToken: () => secure.recoveryToken,
      getOrCreateRecoveryToken,
      readRecoveryEnrollmentKeyId: () => secure.recoveryEnrollmentKeyId,
      writeRecoveryEnrollmentKeyId: (keyId) => {
        secure.recoveryEnrollmentKeyId = keyId
      },
    },
    persistence: {
      readJournal: () => persisted.journal,
      writeJournal: (journal) => {
        persisted.journal = journal
      },
      clearJournal: () => {
        persisted.journal = null
      },
      readLegacyKeyId: () => persisted.legacyKeyId,
      mirrorLegacyKeyId: (keyId) => {
        persisted.legacyKeyId = keyId
      },
    },
    identity: {
      peekUuid: () => identity.uuid,
      getOrCreateUuid: () => {
        identity.uuid ??= 'install-uuid'
        return identity.uuid
      },
      getAccountId: () => 'account-id',
    },
    crypto: {
      sha256Base64: async (value) => {
        hashedClientData.push(value)
        return `base64(${value})`
      },
      sha256Hex:
        options.sha256Hex ??
        (async (value) => {
          hashedRequestData.push(value)
          return createHash('sha256').update(value, 'utf8').digest('hex')
        }),
      recoveryTokenHash: async (token) => {
        recoveryTokensHashed.push(token)
        return RECOVERY_TOKEN_HASH
      },
      randomUuid: () => `operation-${++operation}`,
    },
    transport: {
      getStatus:
        options.getStatus ??
        (async () => ({
          capabilities: {
            appAttest: {
              protocolVersions: [options.protocolVersion ?? 2],
            },
          },
        })),
      post: async <T>(
        endpoint: NotesImportAppAttestEndpoint,
        body: Record<string, unknown>,
        transportOptions?: {
          headers?: Record<string, string>
          signal?: AbortSignal
        }
      ): Promise<T> => {
        const call = {
          endpoint,
          body,
          headers: transportOptions?.headers,
          signal: transportOptions?.signal,
        }
        posts.push(call)
        events.push(`post:${endpoint}:start`)
        let result = options.post
          ? await options.post(call, posts.length - 1)
          : endpoint === 'challenge'
            ? { challenge: `challenge-${++challenge}` }
            : { ok: true }
        if (
          typeof result === 'object' &&
          result !== null &&
          body.protocolVersion === 2
        ) {
          if (endpoint === 'challenge') {
            result = {
              protocolVersion: 2,
              operation: body.operation,
              operationId: body.operationId,
              ...result,
            }
          } else if (endpoint === 'registration') {
            result = {
              protocolVersion: 2,
              operationId: body.operationId,
              status:
                body.operation === 'enroll' ? 'recovery_enrolled' : 'bound',
              recoveryEnrolled: true,
              ...result,
            }
          } else if (endpoint === 'verify') {
            result = {
              protocolVersion: 2,
              operationId: body.operationId,
              ...result,
            }
          }
        }
        events.push(`post:${endpoint}:end`)
        return result as T
      },
    },
    devBypass: {
      enabled: options.devBypass ?? false,
      token: options.devBypass ? 'dev-bypass-token' : '',
    },
    baseUrl: 'https://notes.example.test',
    now: options.now ?? (() => 1_000),
  }

  return {
    module: createNotesImportAppAttest(dependencies),
    dependencies,
    events,
    generateAssertion,
    generateKey,
    getOrCreateRecoveryToken,
    hashedClientData,
    hashedRequestData,
    identity,
    persisted,
    posts,
    recoveryTokensHashed,
    secure,
  }
}

const kickoffRequestHash = async (
  payload: Record<string, unknown>
): Promise<string> => {
  const harness = createHarness({
    activeKeyId: 'active-key',
    recoveryToken: 'recovery-token',
  })
  await harness.module.post({
    endpoint: 'kickoff',
    payload,
    contentHash: CONTENT_HASH,
  })
  const value = harness.posts.find((call) => call.endpoint === 'challenge')
    ?.body.requestHash
  if (typeof value !== 'string') throw new Error('missing requestHash')
  return value
}

describe('Notes Import App Attest', () => {
  it('adopts the TestFlight MMKV key into Keychain without generating a key', async () => {
    const harness = createHarness({
      protocolVersion: 1,
      legacyKeyId: 'legacy-key',
    })

    await harness.module.post({
      endpoint: 'legacy',
      payload: REQUEST_PAYLOAD,
      contentHash: CONTENT_HASH,
    })

    expect(harness.secure.activeKeyId).toBe('legacy-key')
    expect(harness.generateKey).not.toHaveBeenCalled()
    expect(harness.posts.at(-1)?.body).toMatchObject({
      uuid: 'install-uuid',
      accountId: 'account-id',
      keyId: 'legacy-key',
      contentHash: CONTENT_HASH,
    })
  })

  it('enrolls a recovery token for an adopted legacy key in v2', async () => {
    const harness = createHarness({
      protocolVersion: 2,
      legacyKeyId: 'legacy-key',
      recoveryToken: null,
      post: ({ endpoint }) =>
        endpoint === 'challenge' ? { challenge: 'challenge' } : { ok: true },
    })

    await harness.module.post({
      endpoint: 'kickoff',
      payload: REQUEST_PAYLOAD,
      contentHash: CONTENT_HASH,
    })

    expect(harness.secure.activeKeyId).toBe('legacy-key')
    expect(harness.generateKey).not.toHaveBeenCalled()
    expect(harness.getOrCreateRecoveryToken).toHaveBeenCalledTimes(1)
    expect(harness.hashedClientData[0]).toBe(
      `witnesswork.app-attest|2|enroll|operation-2|challenge|install-uuid|legacy-key|${'b'.repeat(43)}`
    )
    expect(
      harness.posts.find((call) => call.endpoint === 'registration')?.body
    ).toEqual({
      protocolVersion: 2,
      operation: 'enroll',
      operationId: 'operation-2',
      uuid: 'install-uuid',
      keyId: 'legacy-key',
      challenge: 'challenge',
      assertion: 'assertion',
      recoveryToken: 'recovery-token',
    })
  })

  it('builds the exact v2 kickoff challenge, client data, and body', async () => {
    const harness = createHarness({
      activeKeyId: 'active-key',
      recoveryToken: 'recovery-token',
      post: ({ endpoint }) =>
        endpoint === 'challenge'
          ? { challenge: 'challenge-value' }
          : { ok: true },
    })

    await harness.module.post({
      endpoint: 'kickoff',
      payload: REQUEST_PAYLOAD,
      contentHash: CONTENT_HASH,
    })

    expect(harness.posts[0]).toMatchObject({
      endpoint: 'challenge',
      body: {
        protocolVersion: 2,
        operation: 'assert',
        operationId: 'operation-1',
        uuid: 'install-uuid',
        keyId: 'active-key',
        purpose: 'notes-import-kickoff',
        accountId: 'account-id',
        contentHash: CONTENT_HASH,
        requestHash: REQUEST_HASH,
      },
    })
    expect(harness.hashedRequestData).toEqual([CANONICAL_REQUEST])
    expect(harness.hashedClientData).toEqual([
      `witnesswork.app-attest|2|assert|notes-import-kickoff|operation-1|challenge-value|install-uuid|account-id|${CONTENT_HASH}|${REQUEST_HASH}`,
    ])
    expect(harness.posts[1]).toMatchObject({
      endpoint: 'kickoff',
      body: {
        notesText: 'private notes',
        protocolVersion: 2,
        operation: 'assert',
        purpose: 'notes-import-kickoff',
        operationId: 'operation-1',
        requestHash: REQUEST_HASH,
        uuid: 'install-uuid',
        accountId: 'account-id',
        contentHash: CONTENT_HASH,
        keyId: 'active-key',
        challenge: 'challenge-value',
        assertion: 'assertion',
      },
    })
  })

  it('matches the shared backend canonical JSON and SHA-256 golden vector', async () => {
    const harness = createHarness({
      activeKeyId: 'active-key',
      recoveryToken: 'recovery-token',
    })
    const payload = {
      notesText: 'Met Ana\nReturn Tuesday',
      context: {
        existingContacts: [
          { name: 'Zoe', id: 'contact-2' },
          { id: 'contact-1', name: 'Ana' },
        ],
        categories: ['Return Visit', 'Bible Study'],
        locale: 'en-US',
      },
    }

    await harness.module.post({
      endpoint: 'kickoff',
      payload,
      contentHash: CONTENT_HASH,
    })

    expect(harness.hashedRequestData).toEqual([
      '{"context":{"categories":["Return Visit","Bible Study"],"existingContacts":[{"id":"contact-2","name":"Zoe"},{"id":"contact-1","name":"Ana"}],"locale":"en-US"},"notesText":"Met Ana\\nReturn Tuesday","refinement":null}',
    ])
    expect(harness.posts[0]?.body.requestHash).toBe(
      '022bb5d93a09241655bf5a32a2b25308b15e3bc75ebfd4524685c9a90b603148'
    )
  })

  it('changes requestHash when signed context changes', async () => {
    const original = await kickoffRequestHash(REQUEST_PAYLOAD)
    const mutated = await kickoffRequestHash({
      ...REQUEST_PAYLOAD,
      context: { ...REQUEST_CONTEXT, timeZone: 'America/New_York' },
    })

    expect(original).toBe(REQUEST_HASH)
    expect(mutated).toMatch(/^[a-f0-9]{64}$/)
    expect(mutated).not.toBe(original)
  })

  it('normalizes absent refinement to null and hashes refinement mutations', async () => {
    const absent = await kickoffRequestHash(REQUEST_PAYLOAD)
    const explicitNull = await kickoffRequestHash({
      ...REQUEST_PAYLOAD,
      refinement: null,
    })
    const first = await kickoffRequestHash({
      ...REQUEST_PAYLOAD,
      refinement: {
        previousResultJSON: '{"summary":"first"}',
        instruction: 'Move it to Friday',
      },
    })
    const mutated = await kickoffRequestHash({
      ...REQUEST_PAYLOAD,
      refinement: {
        previousResultJSON: '{"summary":"first"}',
        instruction: 'Move it to Saturday',
      },
    })

    expect(explicitNull).toBe(absent)
    expect(first).not.toBe(absent)
    expect(mutated).not.toBe(first)
  })

  it('contains kickoff authorization to v1 when capability reports only v1', async () => {
    const harness = createHarness({
      protocolVersion: 1,
      activeKeyId: 'active-key',
      recoveryToken: null,
      post: ({ endpoint }) =>
        endpoint === 'challenge'
          ? { challenge: 'legacy-challenge' }
          : { ok: true },
    })

    await harness.module.post({
      endpoint: 'kickoff',
      payload: REQUEST_PAYLOAD,
      contentHash: CONTENT_HASH,
    })

    expect(harness.posts[0]?.body).toEqual({})
    expect(harness.posts[1]?.body).toEqual({
      ...REQUEST_PAYLOAD,
      uuid: 'install-uuid',
      accountId: 'account-id',
      contentHash: CONTENT_HASH,
      keyId: 'active-key',
      challenge: 'legacy-challenge',
      assertion: 'assertion',
    })
    expect(harness.generateKey).not.toHaveBeenCalled()
    expect(harness.getOrCreateRecoveryToken).not.toHaveBeenCalled()
    expect(harness.hashedRequestData).toEqual([])
  })

  it('contains a first-use bind to the v1 server owner pin', async () => {
    const harness = createHarness({
      protocolVersion: 1,
      activeKeyId: null,
      legacyKeyId: null,
      recoveryToken: null,
      post: ({ endpoint }) =>
        endpoint === 'challenge'
          ? { challenge: 'legacy-challenge' }
          : { ok: true },
    })

    await harness.module.post({
      endpoint: 'kickoff',
      payload: REQUEST_PAYLOAD,
      contentHash: CONTENT_HASH,
    })

    expect(harness.generateKey).toHaveBeenCalledTimes(1)
    expect(harness.getOrCreateRecoveryToken).not.toHaveBeenCalled()
    expect(
      harness.posts.find((call) => call.endpoint === 'registration')?.body
    ).toEqual({
      protocolVersion: 1,
      keyId: 'generated-key-2',
      attestation: 'attestation',
      challenge: 'legacy-challenge',
      uuid: 'install-uuid',
    })
  })

  it('fails safely instead of binding recovery state through v1', async () => {
    const harness = createHarness({
      protocolVersion: 1,
      activeKeyId: null,
      legacyKeyId: null,
      recoveryToken: 'enrolled-recovery-token',
    })

    await expect(
      harness.module.post({
        endpoint: 'kickoff',
        payload: REQUEST_PAYLOAD,
        contentHash: CONTENT_HASH,
      })
    ).rejects.toMatchObject({ code: 'protocolUnavailable' })

    expect(harness.generateKey).not.toHaveBeenCalled()
    expect(harness.persisted.journal).toBeNull()
  })

  it('keeps the legacy synchronous endpoint on v1 under a v2 worker', async () => {
    const harness = createHarness({
      protocolVersion: 2,
      activeKeyId: 'active-key',
      recoveryToken: 'recovery-token',
      post: ({ endpoint }) =>
        endpoint === 'challenge'
          ? { challenge: 'legacy-challenge' }
          : { ok: true },
    })

    await harness.module.post({
      endpoint: 'legacy',
      payload: REQUEST_PAYLOAD,
      contentHash: CONTENT_HASH,
    })

    expect(harness.posts[0]?.body).toEqual({})
    expect(harness.posts[1]?.body.protocolVersion).toBeUndefined()
    expect(harness.hashedClientData).toEqual([
      `legacy-challenge|install-uuid|account-id|${CONTENT_HASH}`,
    ])
  })

  it('holds concurrent protected posts in FIFO order through each response', async () => {
    let releaseFirstResponse: (() => void) | undefined
    const firstResponse = new Promise<void>((resolve) => {
      releaseFirstResponse = resolve
    })
    let protectedPosts = 0
    const harness = createHarness({
      activeKeyId: 'active-key',
      recoveryToken: 'recovery-token',
      post: async ({ endpoint }) => {
        if (endpoint === 'challenge') return { challenge: 'challenge' }
        if (endpoint === 'kickoff' && protectedPosts++ === 0) {
          await firstResponse
        }
        return { ok: true }
      },
    })

    const first = harness.module.post({
      endpoint: 'kickoff',
      payload: { ...REQUEST_PAYLOAD, request: 'first' },
      contentHash: CONTENT_HASH,
    })
    const second = harness.module.post({
      endpoint: 'kickoff',
      payload: { ...REQUEST_PAYLOAD, request: 'second' },
      contentHash: CONTENT_HASH,
    })

    await vi.waitFor(() => {
      expect(
        harness.posts.filter((call) => call.endpoint === 'kickoff')
      ).toHaveLength(1)
    })
    expect(
      harness.posts.filter((call) => call.endpoint === 'challenge')
    ).toHaveLength(1)

    releaseFirstResponse?.()
    await Promise.all([first, second])

    expect(harness.posts.map((call) => call.endpoint)).toEqual([
      'challenge',
      'kickoff',
      'challenge',
      'kickoff',
    ])
    expect(
      harness.posts
        .filter((call) => call.endpoint === 'kickoff')
        .map((call) => call.body.request)
    ).toEqual(['first', 'second'])
  })

  it('skips aborted protected work while it is queued', async () => {
    let releaseFirstResponse: (() => void) | undefined
    const firstResponse = new Promise<void>((resolve) => {
      releaseFirstResponse = resolve
    })
    let kickoffCalls = 0
    const harness = createHarness({
      activeKeyId: 'active-key',
      recoveryToken: 'recovery-token',
      post: async ({ endpoint }) => {
        if (endpoint === 'challenge') return { challenge: 'challenge' }
        if (endpoint === 'kickoff' && kickoffCalls++ === 0) {
          await firstResponse
        }
        return { ok: true }
      },
    })
    const controller = new AbortController()

    const first = harness.module.post({
      endpoint: 'kickoff',
      payload: { ...REQUEST_PAYLOAD, request: 'first' },
      contentHash: CONTENT_HASH,
    })
    await vi.waitFor(() => {
      expect(
        harness.posts.filter((call) => call.endpoint === 'kickoff')
      ).toHaveLength(1)
    })
    const second = harness.module.post({
      endpoint: 'kickoff',
      payload: { ...REQUEST_PAYLOAD, request: 'second' },
      contentHash: CONTENT_HASH,
      signal: controller.signal,
    })
    const cancelled = expect(second).rejects.toMatchObject({
      code: 'cancelled',
    })
    controller.abort()
    releaseFirstResponse?.()

    await Promise.all([first, cancelled])
    expect(
      harness.posts.filter((call) => call.endpoint === 'challenge')
    ).toHaveLength(1)
    expect(
      harness.posts.filter((call) => call.endpoint === 'kickoff')
    ).toHaveLength(1)
    expect(harness.generateAssertion).toHaveBeenCalledTimes(1)
  })

  it('cancels one caller without cancelling shared capability negotiation', async () => {
    let resolveStatus: ((status: unknown) => void) | undefined
    const status = new Promise<unknown>((resolve) => {
      resolveStatus = resolve
    })
    const harness = createHarness({ getStatus: () => status })
    const controller = new AbortController()

    const pending = harness.module.post({
      endpoint: 'kickoff',
      payload: REQUEST_PAYLOAD,
      contentHash: CONTENT_HASH,
      signal: controller.signal,
    })
    controller.abort()

    await expect(pending).rejects.toMatchObject({ code: 'cancelled' })
    expect(harness.generateKey).not.toHaveBeenCalled()

    resolveStatus?.({
      capabilities: { appAttest: { protocolVersions: [2] } },
    })
  })

  it('does not retry a cancelled lifecycle request', async () => {
    const harness = createHarness({
      uuid: null,
      post: ({ endpoint }) => {
        if (endpoint === 'challenge') return { challenge: 'challenge' }
        if (endpoint === 'registration') {
          throw new NotesImportAppAttestHttpError({ kind: 'cancelled' })
        }
        return { ok: true }
      },
    })

    await expect(
      harness.module.post({
        endpoint: 'kickoff',
        payload: REQUEST_PAYLOAD,
        contentHash: CONTENT_HASH,
      })
    ).rejects.toMatchObject({ code: 'cancelled' })

    expect(
      harness.posts.filter((call) => call.endpoint === 'registration')
    ).toHaveLength(1)
    expect(harness.persisted.journal).not.toBeNull()
  })

  it('runs read-only diagnostics through the same per-key FIFO lane', async () => {
    let releaseKickoff: (() => void) | undefined
    const heldKickoff = new Promise<void>((resolve) => {
      releaseKickoff = resolve
    })
    let kickoffCalls = 0
    const harness = createHarness({
      activeKeyId: 'active-key',
      recoveryToken: 'recovery-token',
      post: async ({ endpoint }) => {
        if (endpoint === 'challenge') return { challenge: 'challenge' }
        if (endpoint === 'kickoff' && kickoffCalls++ === 0) await heldKickoff
        return { ok: true }
      },
    })

    const kickoff = harness.module.post({
      endpoint: 'kickoff',
      payload: REQUEST_PAYLOAD,
      contentHash: CONTENT_HASH,
    })
    await vi.waitFor(() => {
      expect(
        harness.posts.filter((call) => call.endpoint === 'kickoff')
      ).toHaveLength(1)
    })
    const diagnostics = harness.module.runDiagnostics()
    await Promise.resolve()
    expect(
      harness.posts.filter((call) => call.endpoint === 'challenge')
    ).toHaveLength(1)

    releaseKickoff?.()
    await kickoff
    const report = await diagnostics

    expect(report.ok).toBe(true)
    expect(harness.posts.map((call) => call.endpoint)).toEqual([
      'challenge',
      'kickoff',
      'challenge',
      'verify',
    ])
    expect(harness.posts[2]?.body.requestHash).toBe(DIAGNOSTIC_HASH)
    expect(harness.posts[3]?.body.requestHash).toBe(DIAGNOSTIC_HASH)
    expect(harness.hashedClientData.at(-1)).toContain(
      `|${DIAGNOSTIC_HASH}|${DIAGNOSTIC_HASH}`
    )
  })

  it('journals a generated key before observing caller cancellation', async () => {
    const controller = new AbortController()
    const harness = createHarness({
      uuid: null,
      generateKey: async () => {
        controller.abort()
        return 'generated-before-cancellation'
      },
      post: ({ endpoint }) =>
        endpoint === 'challenge' ? { challenge: 'challenge' } : { ok: true },
    })

    await expect(
      harness.module.post({
        endpoint: 'kickoff',
        payload: REQUEST_PAYLOAD,
        contentHash: CONTENT_HASH,
        signal: controller.signal,
      })
    ).rejects.toMatchObject({ code: 'cancelled' })
    expect(JSON.parse(harness.persisted.journal!)).toMatchObject({
      kind: 'candidate',
      keyId: 'generated-before-cancellation',
    })

    const restarted = createNotesImportAppAttest(harness.dependencies)
    await restarted.post({
      endpoint: 'kickoff',
      payload: REQUEST_PAYLOAD,
      contentHash: CONTENT_HASH,
    })

    expect(harness.generateKey).toHaveBeenCalledTimes(1)
    expect(harness.secure.activeKeyId).toBe('generated-before-cancellation')
  })

  it('replays the exact candidate registration after response loss', async () => {
    let registrationAttempts = 0
    const harness = createHarness({
      uuid: null,
      post: ({ endpoint, body }) => {
        if (endpoint === 'challenge') {
          return { challenge: `challenge-${String(body.operation)}` }
        }
        if (endpoint === 'registration' && registrationAttempts++ < 2) {
          throw new NotesImportAppAttestHttpError({ kind: 'network' })
        }
        return { ok: true }
      },
    })

    await expect(
      harness.module.post({
        endpoint: 'kickoff',
        payload: REQUEST_PAYLOAD,
        contentHash: CONTENT_HASH,
      })
    ).rejects.toMatchObject({ code: 'network' })
    expect(harness.persisted.journal).not.toBeNull()

    const restartedModule = createNotesImportAppAttest(harness.dependencies)
    await restartedModule.post({
      endpoint: 'kickoff',
      payload: REQUEST_PAYLOAD,
      contentHash: CONTENT_HASH,
    })

    const registrations = harness.posts.filter(
      (call) => call.endpoint === 'registration'
    )
    expect(registrations).toHaveLength(3)
    expect(registrations[1]?.body).toEqual(registrations[0]?.body)
    expect(registrations[2]?.body).toEqual(registrations[0]?.body)
    expect(harness.generateKey).toHaveBeenCalledTimes(1)
    expect(harness.dependencies.appAttest.attestKey).toHaveBeenCalledTimes(1)
    expect(harness.secure.activeKeyId).toMatch(/^generated-key-/)
    expect(harness.persisted.journal).toBeNull()
  })

  it('retries a registration 5xx with the exact operation blob', async () => {
    let registrationAttempts = 0
    const harness = createHarness({
      uuid: null,
      post: ({ endpoint }) => {
        if (endpoint === 'challenge') return { challenge: 'challenge' }
        if (endpoint === 'registration' && registrationAttempts++ === 0) {
          throw new NotesImportAppAttestHttpError({
            kind: 'http',
            status: 503,
            serverCode: 'server_error',
            reason: 'storage_unavailable',
            action: 'retry',
          })
        }
        return { ok: true }
      },
    })

    await harness.module.post({
      endpoint: 'kickoff',
      payload: REQUEST_PAYLOAD,
      contentHash: CONTENT_HASH,
    })

    const registrations = harness.posts.filter(
      (call) => call.endpoint === 'registration'
    )
    expect(registrations).toHaveLength(2)
    expect(registrations[1]?.body).toEqual(registrations[0]?.body)
    expect(harness.generateKey).toHaveBeenCalledTimes(1)
  })

  it('preserves a bind journal on retry and resumes its exact key and operation', async () => {
    let challengeAttempts = 0
    const harness = createHarness({
      uuid: null,
      post: ({ endpoint }) => {
        if (endpoint === 'challenge' && challengeAttempts++ === 0) {
          throw new NotesImportAppAttestHttpError({
            kind: 'http',
            status: 429,
            serverCode: 'attestation_failed',
            reason: 'too_many_challenges',
            action: 'retry',
          })
        }
        return endpoint === 'challenge'
          ? { challenge: 'bind-challenge' }
          : { ok: true }
      },
    })

    await expect(
      harness.module.post({
        endpoint: 'kickoff',
        payload: REQUEST_PAYLOAD,
        contentHash: CONTENT_HASH,
      })
    ).rejects.toMatchObject({
      code: 'serverUnavailable',
      reason: 'too_many_challenges',
      action: 'retry',
    })
    const pending = harness.persisted.journal
    expect(pending).not.toBeNull()

    await harness.module.post({
      endpoint: 'kickoff',
      payload: REQUEST_PAYLOAD,
      contentHash: CONTENT_HASH,
    })

    const bindChallenges = harness.posts.filter(
      (call) => call.endpoint === 'challenge' && call.body.operation === 'bind'
    )
    expect(bindChallenges).toHaveLength(2)
    expect(bindChallenges[1]?.body).toEqual(bindChallenges[0]?.body)
    expect(harness.generateKey).toHaveBeenCalledTimes(1)
    expect(harness.persisted.journal).toBeNull()
  })

  it('preserves an exact enrollment assertion when the server says retry', async () => {
    let registrationAttempts = 0
    const harness = createHarness({
      activeKeyId: 'active-key',
      recoveryToken: 'recovery-token',
      recoveryEnrollmentKeyId: null,
      post: ({ endpoint }) => {
        if (endpoint === 'challenge') return { challenge: 'challenge' }
        if (endpoint === 'registration' && registrationAttempts++ === 0) {
          throw new NotesImportAppAttestHttpError({
            kind: 'http',
            status: 429,
            serverCode: 'attestation_failed',
            reason: 'too_many_challenges',
            action: 'retry',
          })
        }
        return { ok: true }
      },
    })

    await expect(
      harness.module.post({
        endpoint: 'kickoff',
        payload: REQUEST_PAYLOAD,
        contentHash: CONTENT_HASH,
      })
    ).rejects.toMatchObject({
      reason: 'too_many_challenges',
      action: 'retry',
    })
    expect(harness.persisted.journal).not.toBeNull()

    await harness.module.post({
      endpoint: 'kickoff',
      payload: REQUEST_PAYLOAD,
      contentHash: CONTENT_HASH,
    })

    const registrations = harness.posts.filter(
      (call) => call.endpoint === 'registration'
    )
    expect(registrations).toHaveLength(2)
    expect(registrations[1]?.body).toEqual(registrations[0]?.body)
    expect(harness.persisted.journal).toBeNull()
  })

  it('replaces an attested bind candidate once for start_new_operation', async () => {
    let registrations = 0
    const harness = createHarness({
      uuid: null,
      post: ({ endpoint }) => {
        if (endpoint === 'challenge') return { challenge: 'challenge' }
        if (endpoint === 'registration' && registrations++ === 0) {
          throw new NotesImportAppAttestHttpError({
            kind: 'http',
            status: 409,
            serverCode: 'attestation_failed',
            reason: 'operation_conflict',
            action: 'start_new_operation',
          })
        }
        return { ok: true }
      },
    })

    await harness.module.post({
      endpoint: 'kickoff',
      payload: REQUEST_PAYLOAD,
      contentHash: CONTENT_HASH,
    })

    const bodies = harness.posts
      .filter((call) => call.endpoint === 'registration')
      .map((call) => call.body)
    expect(bodies).toHaveLength(2)
    expect(bodies[1]?.operationId).not.toBe(bodies[0]?.operationId)
    expect(bodies[1]?.keyId).not.toBe(bodies[0]?.keyId)
    expect(harness.generateKey).toHaveBeenCalledTimes(2)
    expect(harness.secure.activeKeyId).toBe(bodies[1]?.keyId)
    expect(harness.persisted.journal).toBeNull()
  })

  it('bounds repeated bind operation conflicts with a durable tombstone', async () => {
    const harness = createHarness({
      uuid: null,
      post: ({ endpoint }) => {
        if (endpoint === 'challenge') return { challenge: 'challenge' }
        if (endpoint === 'registration') {
          throw new NotesImportAppAttestHttpError({
            kind: 'http',
            status: 409,
            serverCode: 'attestation_failed',
            reason: 'operation_conflict',
            action: 'start_new_operation',
          })
        }
        return { ok: true }
      },
    })

    await expect(
      harness.module.post({
        endpoint: 'kickoff',
        payload: REQUEST_PAYLOAD,
        contentHash: CONTENT_HASH,
      })
    ).rejects.toMatchObject({
      reason: 'operation_conflict',
      action: 'start_new_operation',
    })

    expect(harness.generateKey).toHaveBeenCalledTimes(2)
    expect(
      harness.posts.filter((call) => call.endpoint === 'registration')
    ).toHaveLength(2)
    expect(harness.persisted.journal).not.toBeNull()

    await expect(
      harness.module.post({
        endpoint: 'kickoff',
        payload: REQUEST_PAYLOAD,
        contentHash: CONTENT_HASH,
      })
    ).rejects.toMatchObject({
      reason: 'operation_conflict',
      action: 'start_new_operation',
    })
    expect(harness.generateKey).toHaveBeenCalledTimes(2)
    expect(harness.persisted.journal).not.toBeNull()
  })

  it('starts a fresh enrollment operation and assertion on request', async () => {
    let enrollmentRegistrations = 0
    let assertions = 0
    const harness = createHarness({
      activeKeyId: 'active-key',
      recoveryToken: 'recovery-token',
      recoveryEnrollmentKeyId: null,
      generateAssertion: async () => `assertion-${++assertions}`,
      post: ({ endpoint, body }) => {
        if (endpoint === 'challenge') return { challenge: 'challenge' }
        if (
          endpoint === 'registration' &&
          body.operation === 'enroll' &&
          enrollmentRegistrations++ === 0
        ) {
          throw new NotesImportAppAttestHttpError({
            kind: 'http',
            status: 409,
            serverCode: 'attestation_failed',
            reason: 'counter_not_increasing',
            action: 'start_new_operation',
          })
        }
        return { ok: true }
      },
    })

    await harness.module.post({
      endpoint: 'kickoff',
      payload: REQUEST_PAYLOAD,
      contentHash: CONTENT_HASH,
    })

    const bodies = harness.posts
      .filter((call) => call.endpoint === 'registration')
      .map((call) => call.body)
    expect(bodies).toHaveLength(2)
    expect(bodies[1]?.operationId).not.toBe(bodies[0]?.operationId)
    expect(bodies[1]?.assertion).not.toBe(bodies[0]?.assertion)
    expect(bodies[1]?.keyId).toBe('active-key')
    expect(harness.generateKey).not.toHaveBeenCalled()
    expect(harness.secure.recoveryEnrollmentKeyId).toBe(
      `active-key|${RECOVERY_TOKEN_HASH}`
    )
  })

  it('builds the exact v2 bind client data and registration body', async () => {
    const harness = createHarness({
      uuid: null,
      post: ({ endpoint }) =>
        endpoint === 'challenge'
          ? { challenge: 'challenge-value' }
          : { ok: true },
    })

    await harness.module.post({
      endpoint: 'kickoff',
      payload: REQUEST_PAYLOAD,
      contentHash: CONTENT_HASH,
    })

    expect(harness.recoveryTokensHashed).toContain('recovery-token')
    expect(harness.hashedClientData[0]).toBe(
      `witnesswork.app-attest|2|bind|operation-2|challenge-value|install-uuid|${'b'.repeat(43)}`
    )
    expect(
      harness.posts.find((call) => call.endpoint === 'registration')?.body
    ).toEqual({
      protocolVersion: 2,
      operation: 'bind',
      operationId: 'operation-2',
      uuid: 'install-uuid',
      keyId: 'generated-key-2',
      challenge: 'challenge-value',
      attestation: 'attestation',
      recoveryToken: 'recovery-token',
    })
  })

  it('does not promote a bind without valid recovery enrollment metadata', async () => {
    const harness = createHarness({
      uuid: null,
      post: ({ endpoint }) =>
        endpoint === 'challenge'
          ? { challenge: 'challenge' }
          : { ok: true, status: 'bound', recoveryEnrolled: false },
    })

    await expect(
      harness.module.post({
        endpoint: 'kickoff',
        payload: REQUEST_PAYLOAD,
        contentHash: CONTENT_HASH,
      })
    ).rejects.toMatchObject({ code: 'authorizationFailed' })

    expect(harness.secure.activeKeyId).toBeNull()
    expect(harness.secure.recoveryEnrollmentKeyId).toBeNull()
    expect(harness.persisted.journal).not.toBeNull()
  })

  it('does not acknowledge enrollment without recoveryEnrolled metadata', async () => {
    const harness = createHarness({
      activeKeyId: 'active-key',
      recoveryToken: 'recovery-token',
      recoveryEnrollmentKeyId: null,
      post: ({ endpoint }) =>
        endpoint === 'challenge'
          ? { challenge: 'challenge' }
          : {
              ok: true,
              status: 'recovery_enrolled',
              recoveryEnrolled: false,
            },
    })

    await expect(
      harness.module.post({
        endpoint: 'kickoff',
        payload: REQUEST_PAYLOAD,
        contentHash: CONTENT_HASH,
      })
    ).rejects.toMatchObject({ code: 'authorizationFailed' })

    expect(harness.secure.recoveryEnrollmentKeyId).toBeNull()
    expect(harness.persisted.journal).not.toBeNull()
  })

  it('retries serverUnavailable with the same candidate key and hash', async () => {
    const serverUnavailable = { nativeCode: 'serverUnavailable' as const }
    let attempts = 0
    const harness = createHarness({
      uuid: null,
      attestKey: async () => {
        if (attempts++ === 0) throw serverUnavailable
        return 'attestation'
      },
      classifyError: (error) =>
        error === serverUnavailable ? 'serverUnavailable' : null,
      post: ({ endpoint }) =>
        endpoint === 'challenge'
          ? { challenge: 'candidate-challenge' }
          : { ok: true },
    })

    await harness.module.post({
      endpoint: 'kickoff',
      payload: REQUEST_PAYLOAD,
      contentHash: CONTENT_HASH,
    })

    expect(harness.dependencies.appAttest.attestKey).toHaveBeenCalledTimes(2)
    expect(
      vi.mocked(harness.dependencies.appAttest.attestKey).mock.calls[1]
    ).toEqual(vi.mocked(harness.dependencies.appAttest.attestKey).mock.calls[0])
    expect(harness.generateKey).toHaveBeenCalledTimes(1)
  })

  it('replaces one key whose generation result was lost across a restart', async () => {
    const harness = createHarness({
      activeKeyId: null,
      recoveryToken: 'recovery-token',
      post: ({ endpoint }) =>
        endpoint === 'challenge' ? { challenge: 'challenge' } : { ok: true },
    })
    harness.persisted.journal = JSON.stringify({
      v: 2,
      kind: 'bootstrap',
      protocolVersion: 2,
      mode: 'initial',
      operationId: 'interrupted-generation',
      uuid: 'install-uuid',
      operationRestartCount: 0,
      recoveryTokenHash: RECOVERY_TOKEN_HASH,
      generationInFlight: true,
      updatedAt: 1_000,
    })

    await harness.module.post({
      endpoint: 'kickoff',
      payload: REQUEST_PAYLOAD,
      contentHash: CONTENT_HASH,
    })

    expect(harness.generateKey).toHaveBeenCalledTimes(1)
    expect(harness.secure.activeKeyId).toMatch(/^generated-key-/)
    expect(
      harness.posts.find((call) => call.endpoint === 'registration')?.body
        .operationId
    ).not.toBe('interrupted-generation')
  })

  it('retains an exhausted key-generation marker as a bounded tombstone', async () => {
    const harness = createHarness({
      activeKeyId: null,
      recoveryToken: 'recovery-token',
    })
    harness.persisted.journal = JSON.stringify({
      v: 2,
      kind: 'bootstrap',
      protocolVersion: 2,
      mode: 'initial',
      operationId: 'exhausted-generation',
      uuid: 'install-uuid',
      operationRestartCount: 1,
      recoveryTokenHash: RECOVERY_TOKEN_HASH,
      generationInFlight: true,
      updatedAt: 1_000,
    })

    const post = () =>
      harness.module.post({
        endpoint: 'kickoff' as const,
        payload: REQUEST_PAYLOAD,
        contentHash: CONTENT_HASH,
      })
    await expect(post()).rejects.toMatchObject({ code: 'invalidState' })
    await expect(post()).rejects.toMatchObject({ code: 'invalidState' })

    expect(harness.generateKey).not.toHaveBeenCalled()
    expect(harness.persisted.journal).toContain('exhausted-generation')
  })

  it('replaces a candidate after an ambiguous one-shot attestation interruption', async () => {
    const interrupted = { nativeCode: 'unknown' as const }
    let attempts = 0
    const harness = createHarness({
      uuid: null,
      attestKey: async () => {
        if (attempts++ === 0) throw interrupted
        return 'replacement-attestation'
      },
      classifyError: (error) => (error === interrupted ? 'unknown' : null),
      post: ({ endpoint }) =>
        endpoint === 'challenge' ? { challenge: 'challenge' } : { ok: true },
    })

    await expect(
      harness.module.post({
        endpoint: 'kickoff',
        payload: REQUEST_PAYLOAD,
        contentHash: CONTENT_HASH,
      })
    ).rejects.toMatchObject({ code: 'nativeUnknown' })
    expect(JSON.parse(harness.persisted.journal!)).toMatchObject({
      kind: 'candidate',
      attestationInFlight: true,
      attestationRetryable: false,
    })

    const restarted = createNotesImportAppAttest(harness.dependencies)
    await restarted.post({
      endpoint: 'kickoff',
      payload: REQUEST_PAYLOAD,
      contentHash: CONTENT_HASH,
    })

    expect(harness.generateKey).toHaveBeenCalledTimes(2)
    expect(harness.dependencies.appAttest.attestKey).toHaveBeenCalledTimes(2)
    expect(harness.persisted.journal).toBeNull()
  })

  it('resumes the same attestation tuple after observed server unavailability', async () => {
    const serverUnavailable = { nativeCode: 'serverUnavailable' as const }
    let attempts = 0
    const harness = createHarness({
      uuid: null,
      attestKey: async () => {
        if (attempts++ < 2) throw serverUnavailable
        return 'attestation'
      },
      classifyError: (error) =>
        error === serverUnavailable ? 'serverUnavailable' : null,
      post: ({ endpoint }) =>
        endpoint === 'challenge' ? { challenge: 'challenge' } : { ok: true },
    })

    await expect(
      harness.module.post({
        endpoint: 'kickoff',
        payload: REQUEST_PAYLOAD,
        contentHash: CONTENT_HASH,
      })
    ).rejects.toMatchObject({ code: 'serverUnavailable' })
    const pending = JSON.parse(harness.persisted.journal!)
    expect(pending).toMatchObject({
      kind: 'candidate',
      attestationInFlight: false,
      attestationRetryable: true,
    })

    const restarted = createNotesImportAppAttest(harness.dependencies)
    await restarted.post({
      endpoint: 'kickoff',
      payload: REQUEST_PAYLOAD,
      contentHash: CONTENT_HASH,
    })

    expect(harness.generateKey).toHaveBeenCalledTimes(1)
    expect(harness.dependencies.appAttest.attestKey).toHaveBeenCalledTimes(3)
    expect(harness.persisted.journal).toBeNull()
  })

  it('keeps an older native binary on contained protocol v1', async () => {
    const harness = createHarness({
      recoveryStorageSupported: false,
      legacyKeyId: 'legacy-key',
    })

    await harness.module.post({
      endpoint: 'kickoff',
      payload: REQUEST_PAYLOAD,
      contentHash: CONTENT_HASH,
    })

    const challenge = harness.posts.find(
      (call) => call.endpoint === 'challenge'
    )
    const kickoff = harness.posts.find((call) => call.endpoint === 'kickoff')
    expect(challenge?.body).toEqual({})
    expect(kickoff?.body.protocolVersion).toBeUndefined()
    expect(harness.getOrCreateRecoveryToken).not.toHaveBeenCalled()
    expect(harness.generateKey).not.toHaveBeenCalled()
  })

  it('re-enrolls while the active key works when its recovery token is missing', async () => {
    const harness = createHarness({
      activeKeyId: 'active-key',
      recoveryToken: null,
      recoveryEnrollmentKeyId: `active-key|${RECOVERY_TOKEN_HASH}`,
      post: ({ endpoint }) =>
        endpoint === 'challenge' ? { challenge: 'challenge' } : { ok: true },
    })

    await harness.module.post({
      endpoint: 'kickoff',
      payload: REQUEST_PAYLOAD,
      contentHash: CONTENT_HASH,
    })

    expect(harness.getOrCreateRecoveryToken).toHaveBeenCalledTimes(1)
    expect(
      harness.posts.find(
        (call) =>
          call.endpoint === 'registration' && call.body.operation === 'enroll'
      )
    ).toBeDefined()
    expect(harness.secure.recoveryEnrollmentKeyId).toBe(
      `active-key|${RECOVERY_TOKEN_HASH}`
    )
  })

  it('prepares recovery only for an existing key', async () => {
    const empty = createHarness({ uuid: null })
    await empty.module.prepareRecovery()
    expect(empty.generateKey).not.toHaveBeenCalled()
    expect(empty.getOrCreateRecoveryToken).not.toHaveBeenCalled()

    const existing = createHarness({
      activeKeyId: 'legacy-active-key',
      recoveryToken: null,
      recoveryEnrollmentKeyId: null,
    })
    await existing.module.prepareRecovery()
    expect(existing.generateKey).not.toHaveBeenCalled()
    expect(existing.getOrCreateRecoveryToken).toHaveBeenCalledTimes(1)
    expect(existing.secure.recoveryEnrollmentKeyId).toBe(
      `legacy-active-key|${RECOVERY_TOKEN_HASH}`
    )
  })

  it.each([
    [
      'a restored journal for another install',
      'different-install',
      1_000,
      2_000,
    ],
    ['an expired lifecycle journal', 'install-uuid', 1, 100_000_000],
    ['an untimestamped lifecycle journal', 'install-uuid', undefined, 1_000],
    ['a future-dated lifecycle journal', 'install-uuid', 400_001, 1_000],
  ] as const)(
    'discards %s instead of permanently blocking auth',
    async (_label, journalUuid, updatedAt, now) => {
      const harness = createHarness({ now: () => now })
      harness.persisted.journal = JSON.stringify({
        v: 2,
        kind: 'bootstrap',
        protocolVersion: 2,
        operationId: 'restored-operation',
        uuid: journalUuid,
        updatedAt,
      })

      await harness.module.post({
        endpoint: 'kickoff',
        payload: REQUEST_PAYLOAD,
        contentHash: CONTENT_HASH,
      })

      expect(harness.persisted.journal).toBeNull()
      expect(
        harness.posts.find((call) => call.endpoint === 'registration')?.body
          .uuid
      ).toBe('install-uuid')
    }
  )

  it.each([
    ['challenge_expired', 'challengeExpired'],
    ['counter_not_increasing', 'counterConflict'],
  ] as const)('retains the active key after %s', async (reason, errorCode) => {
    const harness = createHarness({
      activeKeyId: 'active-key',
      recoveryToken: 'recovery-token',
      post: ({ endpoint }) => {
        if (endpoint === 'challenge') {
          if (reason === 'challenge_expired') {
            throw new NotesImportAppAttestHttpError({
              kind: 'http',
              status: 401,
              serverCode: 'attestation_failed',
              reason,
              action: 'start_new_operation',
            })
          }
          return { challenge: 'challenge' }
        }
        if (endpoint === 'kickoff') {
          throw new NotesImportAppAttestHttpError({
            kind: 'http',
            status: 409,
            serverCode: 'attestation_failed',
            reason,
            action: 'start_new_operation',
          })
        }
        return { ok: true }
      },
    })

    await expect(
      harness.module.post({
        endpoint: 'kickoff',
        payload: REQUEST_PAYLOAD,
        contentHash: CONTENT_HASH,
      })
    ).rejects.toMatchObject({
      code: errorCode,
      reason,
      action: 'start_new_operation',
    })

    expect(
      harness.posts.filter((call) => call.endpoint === 'challenge')
    ).toHaveLength(2)
    expect(
      harness.posts.filter((call) => call.endpoint === 'kickoff')
    ).toHaveLength(reason === 'counter_not_increasing' ? 2 : 0)
    expect(harness.secure.activeKeyId).toBe('active-key')
    expect(harness.generateKey).not.toHaveBeenCalled()
    expect(
      harness.posts.filter((call) => call.endpoint === 'registration')
    ).toHaveLength(0)
  })

  it('performs one controlled recovery after native invalidKey', async () => {
    const invalidKey = { nativeCode: 'invalidKey' as const }
    let assertions = 0
    const harness = createHarness({
      activeKeyId: 'invalid-active-key',
      recoveryToken: 'enrolled-recovery-token',
      generateAssertion: async () => {
        if (assertions++ === 0) throw invalidKey
        return 'assertion'
      },
      classifyError: (error) => (error === invalidKey ? 'invalidKey' : null),
      post: ({ endpoint }) =>
        endpoint === 'challenge' ? { challenge: 'challenge' } : { ok: true },
    })

    await harness.module.post({
      endpoint: 'kickoff',
      payload: REQUEST_PAYLOAD,
      contentHash: CONTENT_HASH,
    })

    expect(harness.generateKey).toHaveBeenCalledTimes(1)
    const registration = harness.posts.find(
      (call) => call.endpoint === 'registration'
    )
    expect(registration?.body).toMatchObject({
      protocolVersion: 2,
      operation: 'bind',
      uuid: 'install-uuid',
      recoveryToken: 'enrolled-recovery-token',
    })
    expect(harness.secure.activeKeyId).toMatch(/^generated-key-/)
    expect(
      harness.posts.filter((call) => call.endpoint === 'kickoff')
    ).toHaveLength(1)
  })

  it('performs one controlled recovery for typed server key_not_active', async () => {
    let kickoffAttempts = 0
    const harness = createHarness({
      activeKeyId: 'inactive-key',
      recoveryToken: 'enrolled-recovery-token',
      post: ({ endpoint }) => {
        if (endpoint === 'challenge') return { challenge: 'challenge' }
        if (endpoint === 'kickoff' && kickoffAttempts++ === 0) {
          throw new NotesImportAppAttestHttpError({
            kind: 'http',
            status: 401,
            serverCode: 'attestation_failed',
            reason: 'key_not_active',
            action: 'use_active_key',
          })
        }
        return { ok: true }
      },
    })

    await harness.module.post({
      endpoint: 'kickoff',
      payload: REQUEST_PAYLOAD,
      contentHash: CONTENT_HASH,
    })

    expect(harness.generateKey).toHaveBeenCalledTimes(1)
    const protectedOperationIds = harness.posts
      .filter((call) => call.endpoint === 'kickoff')
      .map((call) => call.body.operationId)
    expect(protectedOperationIds).toEqual(['operation-1', 'operation-3'])
    expect(harness.secure.activeKeyId).toMatch(/^generated-key-/)
  })

  it('recovers a reinstall only when its recovery token is present', async () => {
    const harness = createHarness({
      activeKeyId: null,
      legacyKeyId: null,
      recoveryToken: 'enrolled-recovery-token',
      post: ({ endpoint }) =>
        endpoint === 'challenge' ? { challenge: 'challenge' } : { ok: true },
    })

    await harness.module.post({
      endpoint: 'kickoff',
      payload: REQUEST_PAYLOAD,
      contentHash: CONTENT_HASH,
    })

    expect(harness.generateKey).toHaveBeenCalledTimes(1)
    expect(
      harness.posts.find((call) => call.endpoint === 'registration')?.body
    ).toMatchObject({
      protocolVersion: 2,
      operation: 'bind',
      recoveryToken: 'enrolled-recovery-token',
    })
  })

  it('never promotes or replaces a candidate for a missing-token reinstall', async () => {
    const harness = createHarness({
      activeKeyId: null,
      recoveryToken: null,
      post: ({ endpoint }) => {
        if (endpoint === 'challenge') return { challenge: 'challenge' }
        if (endpoint === 'registration') {
          throw new NotesImportAppAttestHttpError({
            kind: 'http',
            status: 401,
            serverCode: 'attestation_failed',
            reason: 'recovery_not_enrolled',
            action: 'enroll_recovery',
          })
        }
        return { ok: true }
      },
    })

    const post = () =>
      harness.module.post({
        endpoint: 'kickoff' as const,
        payload: REQUEST_PAYLOAD,
        contentHash: CONTENT_HASH,
      })
    await expect(post()).rejects.toMatchObject({
      code: 'recoveryUnavailable',
    })
    await expect(post()).rejects.toMatchObject({
      code: 'recoveryUnavailable',
    })

    const registrations = harness.posts.filter(
      (call) => call.endpoint === 'registration'
    )
    expect(registrations).toHaveLength(2)
    expect(registrations[1]?.body).toEqual(registrations[0]?.body)
    expect(harness.generateKey).toHaveBeenCalledTimes(1)
    expect(harness.secure.activeKeyId).toBeNull()
    expect(harness.persisted.journal).not.toBeNull()
  })

  it('does not recover when a stale key cannot enroll a new token', async () => {
    const invalidKey = { nativeCode: 'invalidKey' as const }
    const harness = createHarness({
      activeKeyId: 'stale-keychain-key-id',
      recoveryToken: null,
      generateAssertion: async () => {
        throw invalidKey
      },
      classifyError: (error) => (error === invalidKey ? 'invalidKey' : null),
    })

    await expect(
      harness.module.post({
        endpoint: 'kickoff',
        payload: REQUEST_PAYLOAD,
        contentHash: CONTENT_HASH,
      })
    ).rejects.toMatchObject({
      code: 'recoveryUnavailable',
    })

    expect(harness.generateKey).not.toHaveBeenCalled()
    expect(harness.getOrCreateRecoveryToken).toHaveBeenCalledTimes(1)
  })

  it('does not rotate for a generic legacy HTTP 401', async () => {
    const harness = createHarness({
      protocolVersion: 1,
      activeKeyId: 'legacy-active-key',
      post: ({ endpoint }) => {
        if (endpoint === 'challenge') return { challenge: 'challenge' }
        throw new NotesImportAppAttestHttpError({
          kind: 'http',
          status: 401,
          serverCode: 'attestation_failed',
        })
      },
    })

    await expect(
      harness.module.post({
        endpoint: 'legacy',
        payload: REQUEST_PAYLOAD,
        contentHash: CONTENT_HASH,
      })
    ).rejects.toMatchObject({
      code: 'authorizationFailed',
    })

    expect(harness.generateKey).not.toHaveBeenCalled()
    expect(harness.secure.activeKeyId).toBe('legacy-active-key')
    expect(
      harness.posts.filter((call) => call.endpoint === 'registration')
    ).toHaveLength(0)
  })

  it('rejects mismatched verify acknowledgement metadata in diagnostics', async () => {
    const harness = createHarness({
      activeKeyId: 'active-key',
      recoveryToken: 'recovery-token',
      post: ({ endpoint }) => {
        if (endpoint === 'challenge') return { challenge: 'challenge' }
        if (endpoint === 'verify') {
          return { ok: true, operationId: 'different-operation' }
        }
        return { ok: true }
      },
    })

    const report = await harness.module.runDiagnostics()

    expect(report.ok).toBe(false)
    expect(report.steps.at(-1)).toMatchObject({
      step: 'verify',
      ok: false,
      code: 'authorizationFailed',
    })
  })

  it('returns a redacted diagnostic report when account storage fails', async () => {
    const harness = createHarness({
      activeKeyId: 'active-key',
      recoveryToken: 'recovery-token',
    })
    harness.dependencies.identity.getAccountId = () => {
      throw new Error('sensitive storage detail')
    }

    const report = await harness.module.runDiagnostics()

    expect(report).toMatchObject({
      ok: false,
      protocolVersion: 2,
      steps: [
        { step: 'capability', ok: true },
        { step: 'account-state', ok: false, code: 'storageFailure' },
      ],
    })
    expect(JSON.stringify(report)).not.toContain('sensitive storage detail')
    expect(
      harness.posts.filter((call) => call.endpoint === 'challenge')
    ).toHaveLength(0)
  })

  it('keeps snapshots and diagnostics redacted and lifecycle-read-only', async () => {
    const harness = createHarness({
      activeKeyId: 'secret-active-key-id',
      recoveryToken: 'secret-recovery-token',
      post: ({ endpoint }) =>
        endpoint === 'challenge'
          ? { challenge: 'secret-challenge' }
          : { ok: true },
      generateAssertion: async () => 'secret-assertion',
    })

    const snapshot = harness.module.getSnapshot()
    const report = await harness.module.runDiagnostics()
    const diagnosticOutput = JSON.stringify({ snapshot, report })

    expect(report.ok).toBe(true)
    for (const secret of [
      'secret-active-key-id',
      'secret-recovery-token',
      'install-uuid',
      'account-id',
      'secret-challenge',
      'secret-assertion',
    ]) {
      expect(diagnosticOutput).not.toContain(secret)
    }
    expect(snapshot).toMatchObject({
      installIdentity: 'present',
      activeKey: 'keychain',
      recoveryToken: 'present',
    })
    expect(harness.generateKey).not.toHaveBeenCalled()
    expect(harness.dependencies.appAttest.attestKey).not.toHaveBeenCalled()
    expect(harness.getOrCreateRecoveryToken).not.toHaveBeenCalled()
    expect(harness.secure.activeKeyId).toBe('secret-active-key-id')
  })

  it('uses the development bypass without touching App Attest lifecycle', async () => {
    const harness = createHarness({ devBypass: true, uuid: null })

    await harness.module.post({
      endpoint: 'kickoff',
      payload: REQUEST_PAYLOAD,
      contentHash: CONTENT_HASH,
    })

    expect(harness.posts).toHaveLength(1)
    expect(harness.posts[0]).toMatchObject({
      endpoint: 'kickoff',
      headers: { 'x-ww-dev-bypass': 'dev-bypass-token' },
      body: {
        protocolVersion: 2,
        operation: 'assert',
        purpose: 'notes-import-kickoff',
        uuid: 'install-uuid',
        accountId: 'account-id',
        contentHash: CONTENT_HASH,
        requestHash: REQUEST_HASH,
      },
    })
    expect(harness.generateKey).not.toHaveBeenCalled()
    expect(harness.dependencies.appAttest.attestKey).not.toHaveBeenCalled()
    expect(harness.generateAssertion).not.toHaveBeenCalled()
    expect(harness.getOrCreateRecoveryToken).not.toHaveBeenCalled()
  })

  it('proves the development bypass with the protected verify route', async () => {
    const harness = createHarness({ devBypass: true, uuid: null })

    const report = await harness.module.runDiagnostics()

    expect(report.ok).toBe(true)
    expect(harness.posts).toHaveLength(1)
    expect(harness.posts[0]).toMatchObject({
      endpoint: 'verify',
      headers: { 'x-ww-dev-bypass': 'dev-bypass-token' },
      body: {
        protocolVersion: 2,
        operation: 'assert',
        purpose: 'notes-import-verify',
        requestHash: DIAGNOSTIC_HASH,
        contentHash: DIAGNOSTIC_HASH,
      },
    })
    expect(harness.generateAssertion).not.toHaveBeenCalled()
  })
})
