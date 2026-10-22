import { describe, expect, it, vi } from 'vitest'
import {
  createAppAttestAuthorizer,
  AttestationHttpError,
  type AppAttestAuthorizer,
  type AppAttestNativeFailureCode,
  type AppAttestDependencies,
  type AttestationEndpoint,
  type AttestationProof,
} from '@/lib/attestation/appAttest'

const CONTENT_HASH = 'a'.repeat(64)
const REQUEST_HASH = 'f'.repeat(64)
const RECOVERY_TOKEN_HASH = 'b'.repeat(43)
const DIAGNOSTIC_HASH =
  'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'

type PostCall = {
  /**
   * A transport post, or `submit`: the attested request's own route (the
   * feature's `submit` callback), recorded alongside.
   */
  endpoint: AttestationEndpoint | 'submit'
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

  const dependencies: AppAttestDependencies = {
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
        endpoint: AttestationEndpoint,
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
        const isChallenge = endpoint === 'challenge'
        let result = options.post
          ? await options.post(call, posts.length - 1)
          : isChallenge
            ? { challenge: `challenge-${++challenge}` }
            : { ok: true }
        if (
          typeof result === 'object' &&
          result !== null &&
          body.protocolVersion === 2
        ) {
          if (isChallenge) {
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

  /** The attested request's own route: records the proof's fields. */
  const submit = async (
    proof: AttestationProof,
    signal?: AbortSignal
  ): Promise<unknown> => {
    const call: PostCall = {
      endpoint: 'submit',
      body: proof.kind === 'attestation' ? proof.fields : { devBypass: true },
      signal,
    }
    posts.push(call)
    events.push('post:submit:start')
    const result = options.post
      ? await options.post(call, posts.length - 1)
      : { ok: true }
    events.push('post:submit:end')
    return result
  }

  return {
    module: createAppAttestAuthorizer(dependencies),
    dependencies,
    events,
    generateAssertion,
    generateKey,
    getOrCreateRecoveryToken,
    hashedClientData,
    identity,
    persisted,
    posts,
    recoveryTokensHashed,
    secure,
    submit,
  }
}

/**
 * An attested request the way an account session makes one: challenged at
 * `/attestation/v1/challenge`, submitted to the feature's own route.
 */
const attest = (
  harness: ReturnType<typeof createHarness>,
  options: {
    module?: AppAttestAuthorizer
    contentHash?: string
    signal?: AbortSignal
  } = {}
) =>
  (options.module ?? harness.module).assert({
    purpose: 'account-session',
    contentHash: options.contentHash ?? CONTENT_HASH,
    requestHash: REQUEST_HASH,
    submit: (proof, signal) => harness.submit(proof, signal),
    signal: options.signal,
  })

describe('App Attest key lifecycle', () => {
  it('adopts the TestFlight MMKV key into Keychain without generating a key', async () => {
    const harness = createHarness({
      legacyKeyId: 'legacy-key',
      recoveryToken: 'recovery-token',
    })

    await attest(harness)

    expect(harness.secure.activeKeyId).toBe('legacy-key')
    expect(harness.generateKey).not.toHaveBeenCalled()
    expect(harness.posts.at(-1)).toMatchObject({
      endpoint: 'submit',
      body: {
        uuid: 'install-uuid',
        keyId: 'legacy-key',
        contentHash: CONTENT_HASH,
      },
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

    await attest(harness)

    expect(harness.secure.activeKeyId).toBe('legacy-key')
    expect(harness.generateKey).not.toHaveBeenCalled()
    expect(harness.getOrCreateRecoveryToken).toHaveBeenCalledTimes(1)
    expect(harness.hashedClientData[0]).toBe(
      `witnesswork.app-attest|2|enroll|operation-1|challenge|install-uuid|legacy-key|${'b'.repeat(43)}`
    )
    expect(
      harness.posts.find((call) => call.endpoint === 'registration')?.body
    ).toEqual({
      protocolVersion: 2,
      operation: 'enroll',
      operationId: 'operation-1',
      uuid: 'install-uuid',
      keyId: 'legacy-key',
      challenge: 'challenge',
      assertion: 'assertion',
      recoveryToken: 'recovery-token',
    })
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

    // Only repair still runs the lifecycle under v1; assertions need v2.
    const report = await harness.module.runRepair()

    expect(report).toMatchObject({ ok: true, protocolVersion: 1 })
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

    const report = await harness.module.runRepair()

    expect(report.ok).toBe(false)
    expect(report.steps.at(-1)).toMatchObject({
      step: 'ensure-ready',
      ok: false,
      code: 'protocolUnavailable',
    })
    expect(harness.generateKey).not.toHaveBeenCalled()
    expect(harness.persisted.journal).toBeNull()
  })

  it('holds concurrent attested requests in FIFO order through each response', async () => {
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
        if (endpoint === 'submit' && protectedPosts++ === 0) {
          await firstResponse
        }
        return { ok: true }
      },
    })
    const firstHash = '1'.repeat(64)
    const secondHash = '2'.repeat(64)

    const first = attest(harness, { contentHash: firstHash })
    const second = attest(harness, { contentHash: secondHash })

    await vi.waitFor(() => {
      expect(
        harness.posts.filter((call) => call.endpoint === 'submit')
      ).toHaveLength(1)
    })
    expect(
      harness.posts.filter((call) => call.endpoint === 'challenge')
    ).toHaveLength(1)

    releaseFirstResponse?.()
    await Promise.all([first, second])

    expect(harness.posts.map((call) => call.endpoint)).toEqual([
      'challenge',
      'submit',
      'challenge',
      'submit',
    ])
    expect(
      harness.posts
        .filter((call) => call.endpoint === 'submit')
        .map((call) => call.body.contentHash)
    ).toEqual([firstHash, secondHash])
  })

  it('skips aborted protected work while it is queued', async () => {
    let releaseFirstResponse: (() => void) | undefined
    const firstResponse = new Promise<void>((resolve) => {
      releaseFirstResponse = resolve
    })
    let submits = 0
    const harness = createHarness({
      activeKeyId: 'active-key',
      recoveryToken: 'recovery-token',
      post: async ({ endpoint }) => {
        if (endpoint === 'challenge') return { challenge: 'challenge' }
        if (endpoint === 'submit' && submits++ === 0) {
          await firstResponse
        }
        return { ok: true }
      },
    })
    const controller = new AbortController()

    const first = attest(harness)
    await vi.waitFor(() => {
      expect(
        harness.posts.filter((call) => call.endpoint === 'submit')
      ).toHaveLength(1)
    })
    const second = attest(harness, { signal: controller.signal })
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
      harness.posts.filter((call) => call.endpoint === 'submit')
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

    const pending = attest(harness, { signal: controller.signal })
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
          throw new AttestationHttpError({ kind: 'cancelled' })
        }
        return { ok: true }
      },
    })

    await expect(attest(harness)).rejects.toMatchObject({ code: 'cancelled' })

    expect(
      harness.posts.filter((call) => call.endpoint === 'registration')
    ).toHaveLength(1)
    expect(harness.persisted.journal).not.toBeNull()
  })

  it('runs read-only diagnostics through the same per-key FIFO lane', async () => {
    let releaseSubmit: (() => void) | undefined
    const heldSubmit = new Promise<void>((resolve) => {
      releaseSubmit = resolve
    })
    let submits = 0
    const harness = createHarness({
      activeKeyId: 'active-key',
      recoveryToken: 'recovery-token',
      post: async ({ endpoint }) => {
        if (endpoint === 'challenge') return { challenge: 'challenge' }
        if (endpoint === 'submit' && submits++ === 0) await heldSubmit
        return { ok: true }
      },
    })

    const attested = attest(harness)
    await vi.waitFor(() => {
      expect(
        harness.posts.filter((call) => call.endpoint === 'submit')
      ).toHaveLength(1)
    })
    const diagnostics = harness.module.runDiagnostics()
    await Promise.resolve()
    expect(
      harness.posts.filter((call) => call.endpoint === 'challenge')
    ).toHaveLength(1)

    releaseSubmit?.()
    await attested
    const report = await diagnostics

    expect(report.ok).toBe(true)
    expect(harness.posts.map((call) => call.endpoint)).toEqual([
      'challenge',
      'submit',
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
      attest(harness, { signal: controller.signal })
    ).rejects.toMatchObject({ code: 'cancelled' })
    expect(JSON.parse(harness.persisted.journal!)).toMatchObject({
      kind: 'candidate',
      keyId: 'generated-before-cancellation',
    })

    const restarted = createAppAttestAuthorizer(harness.dependencies)
    await attest(harness, { module: restarted })

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
          throw new AttestationHttpError({ kind: 'network' })
        }
        return { ok: true }
      },
    })

    await expect(attest(harness)).rejects.toMatchObject({ code: 'network' })
    expect(harness.persisted.journal).not.toBeNull()

    const restartedModule = createAppAttestAuthorizer(harness.dependencies)
    await attest(harness, { module: restartedModule })

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
          throw new AttestationHttpError({
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

    await attest(harness)

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
          throw new AttestationHttpError({
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

    await expect(attest(harness)).rejects.toMatchObject({
      code: 'serverUnavailable',
      reason: 'too_many_challenges',
      action: 'retry',
    })
    const pending = harness.persisted.journal
    expect(pending).not.toBeNull()

    await attest(harness)

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
          throw new AttestationHttpError({
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

    await expect(attest(harness)).rejects.toMatchObject({
      reason: 'too_many_challenges',
      action: 'retry',
    })
    expect(harness.persisted.journal).not.toBeNull()

    await attest(harness)

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
          throw new AttestationHttpError({
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

    await attest(harness)

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
          throw new AttestationHttpError({
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

    await expect(attest(harness)).rejects.toMatchObject({
      reason: 'operation_conflict',
      action: 'start_new_operation',
    })

    expect(harness.generateKey).toHaveBeenCalledTimes(2)
    expect(
      harness.posts.filter((call) => call.endpoint === 'registration')
    ).toHaveLength(2)
    expect(harness.persisted.journal).not.toBeNull()

    await expect(attest(harness)).rejects.toMatchObject({
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
          throw new AttestationHttpError({
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

    await attest(harness)

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

    await attest(harness)

    expect(harness.recoveryTokensHashed).toContain('recovery-token')
    expect(harness.hashedClientData[0]).toBe(
      `witnesswork.app-attest|2|bind|operation-1|challenge-value|install-uuid|${'b'.repeat(43)}`
    )
    expect(
      harness.posts.find((call) => call.endpoint === 'registration')?.body
    ).toEqual({
      protocolVersion: 2,
      operation: 'bind',
      operationId: 'operation-1',
      uuid: 'install-uuid',
      keyId: 'generated-key-1',
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

    await expect(attest(harness)).rejects.toMatchObject({
      code: 'authorizationFailed',
    })

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

    await expect(attest(harness)).rejects.toMatchObject({
      code: 'authorizationFailed',
    })

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

    await attest(harness)

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

    await attest(harness)

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

    const post = () => attest(harness)
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

    await expect(attest(harness)).rejects.toMatchObject({
      code: 'nativeUnknown',
    })
    expect(JSON.parse(harness.persisted.journal!)).toMatchObject({
      kind: 'candidate',
      attestationInFlight: true,
      attestationRetryable: false,
    })

    const restarted = createAppAttestAuthorizer(harness.dependencies)
    await attest(harness, { module: restarted })

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

    await expect(attest(harness)).rejects.toMatchObject({
      code: 'serverUnavailable',
    })
    const pending = JSON.parse(harness.persisted.journal!)
    expect(pending).toMatchObject({
      kind: 'candidate',
      attestationInFlight: false,
      attestationRetryable: true,
    })

    const restarted = createAppAttestAuthorizer(harness.dependencies)
    await attest(harness, { module: restarted })

    expect(harness.generateKey).toHaveBeenCalledTimes(1)
    expect(harness.dependencies.appAttest.attestKey).toHaveBeenCalledTimes(3)
    expect(harness.persisted.journal).toBeNull()
  })

  it('keeps an older native binary on contained protocol v1', async () => {
    const harness = createHarness({
      recoveryStorageSupported: false,
      legacyKeyId: 'legacy-key',
    })

    await expect(attest(harness)).rejects.toMatchObject({
      code: 'protocolUnavailable',
    })
    const report = await harness.module.runRepair()

    expect(report).toMatchObject({ ok: true, protocolVersion: 1 })
    const challenge = harness.posts.find(
      (call) => call.endpoint === 'challenge'
    )
    const verify = harness.posts.find((call) => call.endpoint === 'verify')
    expect(challenge?.body).toEqual({})
    expect(verify?.body.protocolVersion).toBeUndefined()
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

    await attest(harness)

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

      await attest(harness)

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
            throw new AttestationHttpError({
              kind: 'http',
              status: 401,
              serverCode: 'attestation_failed',
              reason,
              action: 'start_new_operation',
            })
          }
          return { challenge: 'challenge' }
        }
        if (endpoint === 'submit') {
          throw new AttestationHttpError({
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

    await expect(attest(harness)).rejects.toMatchObject({
      code: errorCode,
      reason,
      action: 'start_new_operation',
    })

    expect(
      harness.posts.filter((call) => call.endpoint === 'challenge')
    ).toHaveLength(2)
    expect(
      harness.posts.filter((call) => call.endpoint === 'submit')
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

    await attest(harness)

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
      harness.posts.filter((call) => call.endpoint === 'submit')
    ).toHaveLength(1)
  })

  it('performs one controlled recovery after native invalidInput', async () => {
    // The adapter validates the key id and hash before Apple sees them, so an
    // invalidInput surfacing here means Apple rejected the key id itself.
    const invalidInput = { nativeCode: 'invalidInput' as const }
    let assertions = 0
    const harness = createHarness({
      activeKeyId: 'apple-rejected-key',
      recoveryToken: 'enrolled-recovery-token',
      generateAssertion: async () => {
        if (assertions++ === 0) throw invalidInput
        return 'assertion'
      },
      classifyError: (error) =>
        error === invalidInput ? 'invalidInput' : null,
      post: ({ endpoint }) =>
        endpoint === 'challenge' ? { challenge: 'challenge' } : { ok: true },
    })

    await attest(harness)

    expect(harness.generateKey).toHaveBeenCalledTimes(1)
    expect(harness.secure.activeKeyId).toMatch(/^generated-key-/)
    expect(
      harness.posts.filter((call) => call.endpoint === 'submit')
    ).toHaveLength(1)
  })

  it('never rotates the key for a local invalidArgument failure', async () => {
    // Our own precondition failure is a caller bug. Rotating keys would not fix
    // it, and would burn an App Attest key on every attempt.
    const invalidArgument = { nativeCode: 'invalidArgument' as const }
    const harness = createHarness({
      activeKeyId: 'healthy-key',
      recoveryToken: 'enrolled-recovery-token',
      generateAssertion: async () => {
        throw invalidArgument
      },
      classifyError: (error) =>
        error === invalidArgument ? 'invalidArgument' : null,
      post: ({ endpoint }) =>
        endpoint === 'challenge' ? { challenge: 'challenge' } : { ok: true },
    })

    await expect(attest(harness)).rejects.toMatchObject({
      code: 'invalidArgument',
    })

    expect(harness.generateKey).not.toHaveBeenCalled()
    expect(harness.secure.activeKeyId).toBe('healthy-key')
  })

  it('performs one controlled recovery for typed server key_not_active', async () => {
    let submitAttempts = 0
    const harness = createHarness({
      activeKeyId: 'inactive-key',
      recoveryToken: 'enrolled-recovery-token',
      post: ({ endpoint }) => {
        if (endpoint === 'challenge') return { challenge: 'challenge' }
        if (endpoint === 'submit' && submitAttempts++ === 0) {
          throw new AttestationHttpError({
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

    await attest(harness)

    expect(harness.generateKey).toHaveBeenCalledTimes(1)
    const protectedOperationIds = harness.posts
      .filter((call) => call.endpoint === 'submit')
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

    await attest(harness)

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
          throw new AttestationHttpError({
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

    const post = () => attest(harness)
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

    await expect(attest(harness)).rejects.toMatchObject({
      code: 'recoveryUnavailable',
    })

    expect(harness.generateKey).not.toHaveBeenCalled()
    expect(harness.getOrCreateRecoveryToken).toHaveBeenCalledTimes(1)
  })

  it('does not rotate for a generic HTTP 401', async () => {
    const harness = createHarness({
      activeKeyId: 'active-key',
      recoveryToken: 'recovery-token',
      post: ({ endpoint }) => {
        if (endpoint === 'challenge') return { challenge: 'challenge' }
        throw new AttestationHttpError({
          kind: 'http',
          status: 401,
          serverCode: 'attestation_failed',
        })
      },
    })

    await expect(attest(harness)).rejects.toMatchObject({
      code: 'authorizationFailed',
    })

    expect(harness.generateKey).not.toHaveBeenCalled()
    expect(harness.secure.activeKeyId).toBe('active-key')
    expect(
      harness.posts.filter((call) => call.endpoint === 'registration')
    ).toHaveLength(0)
  })
})

describe('App Attest diagnostics and repair', () => {
  it('sends the exact v2 verify probe through /attestation/v1', async () => {
    const harness = createHarness({
      activeKeyId: 'active-key',
      recoveryToken: 'recovery-token',
      post: ({ endpoint }) =>
        endpoint === 'challenge'
          ? { challenge: 'challenge-value' }
          : { ok: true },
    })

    const report = await harness.module.runDiagnostics()

    expect(report).toMatchObject({ ok: true, protocolVersion: 2 })
    expect(report.steps.map((entry) => entry.step)).toEqual([
      'capability',
      'challenge',
      'client-data-hash',
      'assertion',
      'verify',
    ])
    expect(harness.posts.map((call) => call.endpoint)).toEqual([
      'challenge',
      'verify',
    ])
    expect(harness.posts[0]?.body).toEqual({
      protocolVersion: 2,
      operation: 'assert',
      operationId: 'operation-1',
      uuid: 'install-uuid',
      keyId: 'active-key',
      purpose: 'attestation-verify',
      contentHash: DIAGNOSTIC_HASH,
      requestHash: DIAGNOSTIC_HASH,
    })
    expect(harness.hashedClientData).toEqual([
      `witnesswork.app-attest|2|assert|attestation-verify|operation-1|challenge-value|install-uuid||${DIAGNOSTIC_HASH}|${DIAGNOSTIC_HASH}`,
    ])
    expect(harness.posts[1]?.body).toEqual({
      protocolVersion: 2,
      operation: 'assert',
      purpose: 'attestation-verify',
      operationId: 'operation-1',
      requestHash: DIAGNOSTIC_HASH,
      uuid: 'install-uuid',
      contentHash: DIAGNOSTIC_HASH,
      keyId: 'active-key',
      challenge: 'challenge-value',
      assertion: 'assertion',
    })
  })

  it('sends the v1 verify probe with three-field client data', async () => {
    const harness = createHarness({
      protocolVersion: 1,
      activeKeyId: 'active-key',
      recoveryToken: null,
      post: ({ endpoint }) =>
        endpoint === 'challenge'
          ? { challenge: 'legacy-challenge' }
          : { ok: true },
    })

    const report = await harness.module.runDiagnostics()

    expect(report).toMatchObject({ ok: true, protocolVersion: 1 })
    expect(harness.posts.map((call) => [call.endpoint, call.body])).toEqual([
      ['challenge', {}],
      [
        'verify',
        {
          uuid: 'install-uuid',
          contentHash: DIAGNOSTIC_HASH,
          keyId: 'active-key',
          challenge: 'legacy-challenge',
          assertion: 'assertion',
        },
      ],
    ])
    expect(harness.hashedClientData).toEqual([
      `legacy-challenge|install-uuid|${DIAGNOSTIC_HASH}`,
    ])
    expect(harness.generateKey).not.toHaveBeenCalled()
    expect(harness.getOrCreateRecoveryToken).not.toHaveBeenCalled()
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

  it('returns a redacted diagnostic report when identity storage fails', async () => {
    const harness = createHarness({
      activeKeyId: 'active-key',
      recoveryToken: 'recovery-token',
    })
    harness.dependencies.identity.peekUuid = () => {
      throw new Error('sensitive storage detail')
    }

    const report = await harness.module.runDiagnostics()

    expect(report).toEqual({
      ok: false,
      protocolVersion: null,
      correlationId: 'operation-1',
      steps: [{ step: 'read-state', ok: false, ms: 0, code: 'storageFailure' }],
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
      recoveryEnrollment: 'acknowledged',
    })
    expect(harness.generateKey).not.toHaveBeenCalled()
    expect(harness.dependencies.appAttest.attestKey).not.toHaveBeenCalled()
    expect(harness.getOrCreateRecoveryToken).not.toHaveBeenCalled()
    expect(harness.secure.activeKeyId).toBe('secret-active-key-id')
  })

  it('proves the development bypass with the verify route', async () => {
    const harness = createHarness({ devBypass: true, uuid: null })

    const report = await harness.module.runDiagnostics()

    expect(report.ok).toBe(true)
    expect(report.steps.map((entry) => entry.step)).toEqual([
      'capability',
      'identity',
      'verify',
    ])
    expect(harness.posts).toHaveLength(1)
    expect(harness.posts[0]).toMatchObject({
      endpoint: 'verify',
      headers: { 'x-ww-dev-bypass': 'dev-bypass-token' },
    })
    expect(harness.posts[0]?.body).toEqual({
      protocolVersion: 2,
      operation: 'assert',
      purpose: 'attestation-verify',
      operationId: 'operation-1',
      requestHash: DIAGNOSTIC_HASH,
      uuid: 'install-uuid',
      contentHash: DIAGNOSTIC_HASH,
    })
    expect(harness.generateAssertion).not.toHaveBeenCalled()
  })

  it('reports a dead key as recoverable when the recovery credential exists', async () => {
    const invalidInput = { nativeCode: 'invalidInput' as const }
    const harness = createHarness({
      activeKeyId: 'apple-rejected-key',
      recoveryToken: 'enrolled-recovery-token',
      generateAssertion: async () => {
        throw invalidInput
      },
      classifyError: (error) =>
        error === invalidInput ? 'invalidInput' : null,
    })

    const report = await harness.module.runDiagnostics()

    expect(report.ok).toBe(false)
    expect(report.steps.at(-2)).toMatchObject({
      step: 'assertion',
      ok: false,
      code: 'invalidInput',
    })
    expect(report.steps.at(-1)).toEqual({
      step: 'recovery-available',
      ok: true,
      ms: 0,
    })
    expect(harness.generateKey).not.toHaveBeenCalled()
    expect(harness.secure.activeKeyId).toBe('apple-rejected-key')
  })

  it('reports a dead key as unrecoverable without a recovery token', async () => {
    const invalidKey = { nativeCode: 'invalidKey' as const }
    const harness = createHarness({
      activeKeyId: 'stale-keychain-key-id',
      recoveryToken: null,
      generateAssertion: async () => {
        throw invalidKey
      },
      classifyError: (error) => (error === invalidKey ? 'invalidKey' : null),
    })

    const report = await harness.module.runDiagnostics()

    expect(report.ok).toBe(false)
    expect(report.steps.at(-1)).toMatchObject({
      step: 'recovery-available',
      ok: false,
      code: 'recoveryUnavailable',
    })
  })

  it('repairs a dead key through the attested verify no-op', async () => {
    const invalidInput = { nativeCode: 'invalidInput' as const }
    let assertions = 0
    const harness = createHarness({
      activeKeyId: 'apple-rejected-key',
      recoveryToken: 'enrolled-recovery-token',
      generateAssertion: async () => {
        if (assertions++ === 0) throw invalidInput
        return 'signed-assertion-value'
      },
      classifyError: (error) =>
        error === invalidInput ? 'invalidInput' : null,
      post: ({ endpoint }) =>
        endpoint === 'challenge'
          ? { challenge: 'issued-challenge-value' }
          : { ok: true },
    })

    const report = await harness.module.runRepair()

    expect(report.ok).toBe(true)
    expect(report.keyRotated).toBe(true)
    expect(report.protocolVersion).toBe(2)
    expect(
      report.steps.map(
        (entry) => `${entry.step}:${entry.ok ? 'ok' : (entry.code ?? 'fail')}`
      )
    ).toEqual([
      'supported:ok',
      'capability:ok',
      'ensure-ready:ok',
      'challenge:ok',
      'assertion:invalidInput',
      'recover-key:ok',
      'challenge:ok',
      'assertion:ok',
      'verify:ok',
    ])
    expect(harness.generateKey).toHaveBeenCalledTimes(1)
    expect(harness.secure.activeKeyId).toMatch(/^generated-key-/)
    expect(
      harness.posts.find((call) => call.endpoint === 'registration')?.body
    ).toMatchObject({
      protocolVersion: 2,
      operation: 'bind',
      recoveryToken: 'enrolled-recovery-token',
    })
    const verifies = harness.posts.filter((call) => call.endpoint === 'verify')
    expect(verifies).toHaveLength(1)
    expect(verifies[0]?.body).toMatchObject({
      protocolVersion: 2,
      operation: 'assert',
      purpose: 'attestation-verify',
      contentHash: DIAGNOSTIC_HASH,
      requestHash: DIAGNOSTIC_HASH,
      uuid: 'install-uuid',
    })
    expect(verifies[0]?.body).not.toHaveProperty('accountId')
    expect(
      harness.posts
        .filter((call) => call.endpoint === 'challenge')
        .map((call) => call.body.purpose ?? call.body.operation)
    ).toEqual(['attestation-verify', 'bind', 'attestation-verify'])
    const serialized = JSON.stringify(report)
    for (const secret of [
      'apple-rejected-key',
      'generated-key',
      'enrolled-recovery-token',
      'issued-challenge-value',
      'signed-assertion-value',
      'install-uuid',
      'account-id',
    ]) {
      expect(serialized).not.toContain(secret)
    }
  })

  it('verifies a healthy key without rotating through repair', async () => {
    const harness = createHarness({
      activeKeyId: 'healthy-key',
      recoveryToken: 'enrolled-recovery-token',
      post: ({ endpoint }) =>
        endpoint === 'challenge' ? { challenge: 'challenge' } : { ok: true },
    })

    const report = await harness.module.runRepair()

    expect(report.ok).toBe(true)
    expect(report.keyRotated).toBe(false)
    expect(report.steps.map((entry) => entry.step)).toEqual([
      'supported',
      'capability',
      'ensure-ready',
      'challenge',
      'assertion',
      'verify',
    ])
    expect(report.steps.every((entry) => entry.ok)).toBe(true)
    expect(harness.generateKey).not.toHaveBeenCalled()
    expect(harness.secure.activeKeyId).toBe('healthy-key')
  })

  it('reports a failed rotation when the server rejects the recovery token', async () => {
    const invalidKey = { nativeCode: 'invalidKey' as const }
    const harness = createHarness({
      activeKeyId: 'apple-rejected-key',
      recoveryToken: 'mismatched-recovery-token',
      generateAssertion: async () => {
        throw invalidKey
      },
      classifyError: (error) => (error === invalidKey ? 'invalidKey' : null),
      post: ({ endpoint }) => {
        if (endpoint === 'challenge') return { challenge: 'challenge' }
        if (endpoint === 'registration') {
          throw new AttestationHttpError({
            kind: 'http',
            status: 401,
            serverCode: 'attestation_failed',
            reason: 'recovery_token_mismatch',
            action: 'none',
          })
        }
        return { ok: true }
      },
    })

    const report = await harness.module.runRepair()

    expect(report.ok).toBe(false)
    expect(report.keyRotated).toBe(false)
    expect(report.steps.at(-1)).toMatchObject({
      step: 'recover-key',
      ok: false,
      code: 'recoveryUnavailable',
    })
    expect(harness.secure.activeKeyId).toBe('apple-rejected-key')
  })

  it('fails repair at readiness when a dead key has no recovery token', async () => {
    const invalidKey = { nativeCode: 'invalidKey' as const }
    const harness = createHarness({
      activeKeyId: 'stale-keychain-key-id',
      recoveryToken: null,
      generateAssertion: async () => {
        throw invalidKey
      },
      classifyError: (error) => (error === invalidKey ? 'invalidKey' : null),
    })

    const report = await harness.module.runRepair()

    expect(report.ok).toBe(false)
    expect(report.keyRotated).toBe(false)
    expect(report.steps.at(-1)).toMatchObject({
      step: 'ensure-ready',
      ok: false,
      code: 'recoveryUnavailable',
    })
    expect(harness.generateKey).not.toHaveBeenCalled()
  })

  it('rejects mismatched verify acknowledgement metadata in repair', async () => {
    const harness = createHarness({
      activeKeyId: 'healthy-key',
      recoveryToken: 'enrolled-recovery-token',
      post: ({ endpoint }) => {
        if (endpoint === 'challenge') return { challenge: 'challenge' }
        if (endpoint === 'verify') {
          return { ok: true, operationId: 'different-operation' }
        }
        return { ok: true }
      },
    })

    const report = await harness.module.runRepair()

    expect(report.ok).toBe(false)
    expect(report.keyRotated).toBe(false)
    expect(report.steps.at(-1)).toMatchObject({
      step: 'verify',
      ok: false,
      code: 'authorizationFailed',
    })
    expect(harness.generateKey).not.toHaveBeenCalled()
  })

  it('proves the development bypass through repair without lifecycle access', async () => {
    const harness = createHarness({ devBypass: true, uuid: null })

    const report = await harness.module.runRepair()

    expect(report.ok).toBe(true)
    expect(report.keyRotated).toBe(false)
    expect(harness.posts).toHaveLength(1)
    expect(harness.posts[0]).toMatchObject({
      endpoint: 'verify',
      headers: { 'x-ww-dev-bypass': 'dev-bypass-token' },
      body: { purpose: 'attestation-verify' },
    })
    expect(harness.generateAssertion).not.toHaveBeenCalled()
  })
})

describe('App Attest for other features (assert)', () => {
  const SESSION_HASH = 'c'.repeat(64)

  /** A feature's own challenge and request routes, recorded. */
  const channel = (
    submit: (proof: unknown, call: number) => unknown = () => ({ ok: true })
  ) => {
    const challenges: Record<string, unknown>[] = []
    const proofs: unknown[] = []
    let issued = 0
    return {
      challenges,
      proofs,
      request: {
        purpose: 'account-session' as const,
        contentHash: SESSION_HASH,
        requestHash: SESSION_HASH,
        challenge: async (body: Record<string, unknown>) => {
          challenges.push(body)
          return {
            protocolVersion: 2,
            operation: body.operation,
            operationId: body.operationId,
            challenge: `session-challenge-${++issued}`,
          }
        },
        submit: async (proof: unknown) => {
          proofs.push(proof)
          return submit(proof, proofs.length - 1)
        },
      },
    }
  }

  it('gets the challenge from /attestation/v1 when the feature has no route of its own', async () => {
    const harness = createHarness({
      activeKeyId: 'active-key',
      recoveryToken: 'recovery-token',
    })
    const { challenge: _own, ...request } = channel().request

    await expect(harness.module.assert(request)).resolves.toEqual({
      ok: true,
    })

    expect(harness.posts.map((call) => call.endpoint)).toEqual(['challenge'])
    expect(harness.posts[0].body).toMatchObject({
      purpose: 'account-session',
      contentHash: SESSION_HASH,
      requestHash: SESSION_HASH,
    })
  })

  it('asserts through the feature routes without an install account id', async () => {
    const harness = createHarness({
      activeKeyId: 'active-key',
      recoveryToken: 'recovery-token',
    })
    const routes = channel()

    await expect(harness.module.assert(routes.request)).resolves.toEqual({
      ok: true,
    })

    expect(routes.challenges).toEqual([
      {
        protocolVersion: 2,
        operation: 'assert',
        operationId: 'operation-1',
        uuid: 'install-uuid',
        keyId: 'active-key',
        purpose: 'account-session',
        contentHash: SESSION_HASH,
        requestHash: SESSION_HASH,
      },
    ])
    expect(routes.challenges[0]).not.toHaveProperty('accountId')
    expect(harness.hashedClientData).toEqual([
      `witnesswork.app-attest|2|assert|account-session|operation-1|session-challenge-1|install-uuid||${SESSION_HASH}|${SESSION_HASH}`,
    ])
    expect(routes.proofs).toEqual([
      {
        kind: 'attestation',
        fields: {
          protocolVersion: 2,
          operation: 'assert',
          purpose: 'account-session',
          operationId: 'operation-1',
          requestHash: SESSION_HASH,
          uuid: 'install-uuid',
          contentHash: SESSION_HASH,
          keyId: 'active-key',
          challenge: 'session-challenge-1',
          assertion: 'assertion',
        },
      },
    ])
    // Nothing went to the shared /attestation/v1 routes.
    expect(harness.posts).toEqual([])
  })

  it('asks again under a fresh operation once when the challenge expired', async () => {
    const harness = createHarness({
      activeKeyId: 'active-key',
      recoveryToken: 'recovery-token',
    })
    const routes = channel((_proof, call) => {
      if (call === 0)
        throw new AttestationHttpError({
          kind: 'http',
          status: 401,
          serverCode: 'attestation_failed',
          reason: 'challenge_expired',
        })
      return { ok: true }
    })

    await harness.module.assert(routes.request)

    expect(routes.challenges.map((body) => body.operationId)).toEqual([
      'operation-1',
      'operation-2',
    ])
    expect(routes.proofs).toHaveLength(2)
  })

  it('keeps a refused attestation reason and passes other answers through', async () => {
    const harness = createHarness({
      activeKeyId: 'active-key',
      recoveryToken: 'recovery-token',
    })
    const refused = channel(() => {
      throw new AttestationHttpError({
        kind: 'http',
        status: 403,
        serverCode: 'attestation_failed',
        reason: 'assertion_invalid',
      })
    })
    await expect(harness.module.assert(refused.request)).rejects.toMatchObject({
      name: 'AttestationError',
      code: 'authorizationFailed',
      serverCode: 'attestation_failed',
      reason: 'assertion_invalid',
    })

    const upgrade = channel(() => {
      throw new AttestationHttpError({
        kind: 'http',
        status: 426,
        serverCode: 'upgrade_required',
      })
    })
    await expect(harness.module.assert(upgrade.request)).rejects.toMatchObject({
      name: 'AttestationHttpError',
      status: 426,
    })
  })

  it('sends the dev bypass instead of a challenge in dev builds', async () => {
    const harness = createHarness({ devBypass: true, uuid: null })
    const routes = channel()

    await harness.module.assert(routes.request)

    expect(routes.challenges).toEqual([])
    expect(routes.proofs).toEqual([
      { kind: 'devBypass', token: 'dev-bypass-token' },
    ])
    expect(harness.posts).toEqual([])
    expect(harness.generateKey).not.toHaveBeenCalled()
    expect(harness.dependencies.appAttest.attestKey).not.toHaveBeenCalled()
    expect(harness.generateAssertion).not.toHaveBeenCalled()
    expect(harness.getOrCreateRecoveryToken).not.toHaveBeenCalled()
  })

  it('refuses malformed hashes and a worker without protocol v2', async () => {
    const harness = createHarness({
      activeKeyId: 'active-key',
      recoveryToken: 'recovery-token',
    })
    const routes = channel()
    await expect(
      harness.module.assert({ ...routes.request, requestHash: 'nope' })
    ).rejects.toMatchObject({ code: 'invalidInput' })

    const v1 = createHarness({ protocolVersion: 1, activeKeyId: 'active-key' })
    await expect(v1.module.assert(routes.request)).rejects.toMatchObject({
      code: 'protocolUnavailable',
    })
    expect(routes.challenges).toEqual([])
  })

  it('reports whether App Attest is supported without touching a key', async () => {
    const harness = createHarness()
    await expect(harness.module.checkSupport()).resolves.toBe('supported')

    harness.dependencies.appAttest.isSupported = () => false
    await expect(harness.module.checkSupport()).resolves.toBe('unsupported')
    await expect(
      harness.module.assert(channel().request)
    ).rejects.toMatchObject({ code: 'unsupported' })

    const bypass = createHarness({ devBypass: true })
    bypass.dependencies.appAttest.isSupported = () => false
    await expect(bypass.module.checkSupport()).resolves.toBe('supported')
    expect(harness.generateKey).not.toHaveBeenCalled()
  })
})
