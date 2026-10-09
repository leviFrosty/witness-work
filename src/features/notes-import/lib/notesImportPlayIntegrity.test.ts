import { createHash } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import {
  DIAGNOSTIC_CONTENT_HASH,
  NotesImportAppAttestError,
  NotesImportAppAttestHttpError,
  type NotesImportAppAttestEndpoint,
} from '@/features/notes-import/lib/notesImportAppAttest'
import {
  buildPlayIntegrityClientData,
  createNotesImportPlayIntegrity,
  tokenRetryDelayMs,
  type NotesImportPlayIntegrityDependencies,
  type PlayIntegrityNativeFailureCode,
} from '@/features/notes-import/lib/notesImportPlayIntegrity'

const CONTENT_HASH =
  'e0129726d5d80305a40c79da48fae94cdf34a3e95b8a476c5287f268699d7097'
const PAYLOAD = {
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
// The canonical request hash ww-api recomputes for PAYLOAD (shared golden).
const REQUEST_HASH =
  '022bb5d93a09241655bf5a32a2b25308b15e3bc75ebfd4524685c9a90b603148'
const CHALLENGE = 'C'.repeat(43)

const sha256Hex = async (value: string) =>
  createHash('sha256').update(value).digest('hex')

const STATUS = {
  available: true,
  capabilities: {
    appAttest: { protocolVersions: [1, 2] },
    playIntegrity: {
      protocolVersions: [1],
      cloudProjectNumber: '123456789012',
    },
  },
}

class NativeError extends Error {
  constructor(readonly code: PlayIntegrityNativeFailureCode) {
    super(code)
  }
}

type PostHandler = (
  endpoint: NotesImportAppAttestEndpoint,
  body: Record<string, unknown>,
  headers?: Record<string, string>
) => unknown

const createHarness = (
  options: {
    status?: unknown
    supported?: boolean
    devBypass?: boolean
    post?: PostHandler
    requestToken?: (project: string, hash: string) => Promise<string>
    getStatus?: () => Promise<unknown>
    random?: () => number
  } = {}
) => {
  let operation = 0
  const posts: {
    endpoint: NotesImportAppAttestEndpoint
    body: Record<string, unknown>
    headers?: Record<string, string>
  }[] = []
  const defaultPost: PostHandler = (endpoint, body) =>
    endpoint === 'challenge'
      ? {
          attestationProvider: 'play-integrity',
          protocolVersion: 1,
          operation: 'assert',
          operationId: body.operationId,
          challenge: CHALLENGE,
          expiresAt: 1,
        }
      : endpoint === 'verify'
        ? {
            ok: true,
            attestationProvider: 'play-integrity',
            protocolVersion: 1,
            operationId: body.operationId,
          }
        : { importId: 'imp_1', subscribeToken: 'sub' }
  const dependencies: NotesImportPlayIntegrityDependencies = {
    playIntegrity: {
      isSupported: () => options.supported ?? true,
      prepare: vi.fn(async () => {}),
      requestToken: vi.fn(
        options.requestToken ?? (async () => 'integrity.token')
      ),
      classifyError: (error) =>
        error instanceof NativeError ? error.code : null,
    },
    identity: {
      getOrCreateUuid: () => 'install-uuid-1',
      getAccountId: () => 'account-id-1',
    },
    crypto: {
      sha256Hex,
      randomUuid: () => `operation-${++operation}`,
    },
    transport: {
      getStatus: vi.fn(
        options.getStatus ?? (async () => options.status ?? STATUS)
      ),
      post: vi.fn(async (endpoint, body, requestOptions) => {
        posts.push({ endpoint, body, headers: requestOptions?.headers })
        const result = await (options.post ?? defaultPost)(
          endpoint,
          body,
          requestOptions?.headers
        )
        if (result instanceof Error) throw result
        return result
      }) as NotesImportPlayIntegrityDependencies['transport']['post'],
    },
    devBypass: { enabled: options.devBypass ?? false, token: 'bypass' },
    baseUrl: 'https://api.example',
    now: () => 0,
    sleep: vi.fn(async () => {}),
    random: options.random ?? (() => 0),
  }
  return {
    dependencies,
    posts,
    module: createNotesImportPlayIntegrity(dependencies),
  }
}

const kickoff = (
  harness: ReturnType<typeof createHarness>,
  signal?: AbortSignal
) =>
  harness.module.post<unknown>({
    endpoint: 'kickoff',
    payload: PAYLOAD,
    contentHash: CONTENT_HASH,
    signal,
  })

const httpError = (status: number, reason: string, serverCode?: string) =>
  new NotesImportAppAttestHttpError({
    kind: 'http',
    status,
    reason,
    serverCode: serverCode ?? 'attestation_failed',
    action: 'start_new_operation',
  })

describe('buildPlayIntegrityClientData', () => {
  it('matches the ww-api golden byte for byte', async () => {
    const clientData = buildPlayIntegrityClientData({
      purpose: 'notes-import-kickoff',
      operationId: 'play-operation-1',
      challenge: CHALLENGE,
      uuid: '65A8B00C-DA7A-4E0A-BA5C-8E3D1B8C5F1C',
      accountId: 'account-id-1',
      contentHash: CONTENT_HASH,
      requestHash: REQUEST_HASH,
    })
    await expect(sha256Hex(clientData)).resolves.toBe(
      '75142f154cfe8b4a2e20220371bfe27d127f93fda168c93d8578c28b508ed08a'
    )
  })
})

describe('Notes Import Play Integrity', () => {
  it('binds a challenge-scoped token to the exact kickoff', async () => {
    const harness = createHarness()

    await expect(kickoff(harness)).resolves.toEqual({
      importId: 'imp_1',
      subscribeToken: 'sub',
    })

    const fields = {
      attestationProvider: 'play-integrity',
      protocolVersion: 1,
      operation: 'assert',
      operationId: 'operation-1',
      uuid: 'install-uuid-1',
      accountId: 'account-id-1',
      purpose: 'notes-import-kickoff',
      contentHash: CONTENT_HASH,
      requestHash: REQUEST_HASH,
    }
    expect(harness.posts).toEqual([
      { endpoint: 'challenge', body: fields, headers: undefined },
      {
        endpoint: 'kickoff',
        body: {
          ...PAYLOAD,
          ...fields,
          challenge: CHALLENGE,
          integrityToken: 'integrity.token',
        },
        headers: undefined,
      },
    ])
    const binding = await sha256Hex(
      buildPlayIntegrityClientData({ ...fields, challenge: CHALLENGE } as never)
    )
    expect(
      harness.dependencies.playIntegrity.requestToken
    ).toHaveBeenCalledWith('123456789012', binding)
    // Warmed while the challenge round-trips.
    expect(harness.dependencies.playIntegrity.prepare).toHaveBeenCalledWith(
      '123456789012'
    )
  })

  it.each(['challenge_expired', 'integrity_token_invalid'])(
    'retries once under a fresh operation after %s',
    async (reason) => {
      let kickoffs = 0
      const harness = createHarness({
        post: (endpoint, body) => {
          if (endpoint === 'challenge') {
            return {
              attestationProvider: 'play-integrity',
              operationId: body.operationId,
              challenge: CHALLENGE,
            }
          }
          kickoffs += 1
          return kickoffs === 1 ? httpError(401, reason) : { importId: 'imp_2' }
        },
      })

      await expect(kickoff(harness)).resolves.toEqual({ importId: 'imp_2' })
      expect(
        harness.posts
          .filter((post) => post.endpoint === 'challenge')
          .map((post) => post.body.operationId)
      ).toEqual(['operation-1', 'operation-2'])
    }
  )

  it('stops after the single fresh-operation retry', async () => {
    const harness = createHarness({
      post: (endpoint, body) =>
        endpoint === 'challenge'
          ? {
              attestationProvider: 'play-integrity',
              operationId: body.operationId,
              challenge: CHALLENGE,
            }
          : httpError(401, 'challenge_not_found'),
    })

    await expect(kickoff(harness)).rejects.toMatchObject({
      code: 'challengeExpired',
      reason: 'challenge_not_found',
    })
    expect(harness.posts.filter((p) => p.endpoint === 'kickoff')).toHaveLength(
      2
    )
  })

  it.each([
    ['device_integrity_failed', 'deviceIneligible'],
    ['app_not_recognized', 'deviceIneligible'],
    ['integrity_unavailable', 'serverUnavailable'],
  ])('maps server reason %s to %s', async (reason, code) => {
    const harness = createHarness({
      post: (endpoint, body) =>
        endpoint === 'challenge'
          ? {
              attestationProvider: 'play-integrity',
              operationId: body.operationId,
              challenge: CHALLENGE,
            }
          : new NotesImportAppAttestHttpError({
              kind: 'http',
              status: 403,
              reason,
              serverCode: 'attestation_failed',
              action: 'none',
            }),
    })

    const error = await kickoff(harness).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(NotesImportAppAttestError)
    expect(error).toMatchObject({ code, reason })
  })

  it('passes allowance denials through as the server’s own codes', async () => {
    const denial = new NotesImportAppAttestHttpError({
      kind: 'http',
      status: 402,
      serverCode: 'limit_reached',
      credits: { remaining: 0 },
    })
    const harness = createHarness({
      post: (endpoint, body) =>
        endpoint === 'challenge'
          ? {
              attestationProvider: 'play-integrity',
              operationId: body.operationId,
              challenge: CHALLENGE,
            }
          : denial,
    })

    await expect(kickoff(harness)).rejects.toBe(denial)
  })

  it.each([
    ['playServicesOutdated', 'playServicesUnavailable'],
    ['playStoreNotFound', 'playServicesUnavailable'],
    ['appUidMismatch', 'deviceIneligible'],
    ['cloudProjectNumberInvalid', 'invalidInput'],
    ['unknown', 'nativeUnknown'],
  ] as const)('maps native %s to %s without retrying', async (native, code) => {
    const harness = createHarness({
      requestToken: async () => {
        throw new NativeError(native)
      },
    })

    await expect(kickoff(harness)).rejects.toMatchObject({ code })
    expect(
      harness.dependencies.playIntegrity.requestToken
    ).toHaveBeenCalledTimes(1)
    expect(harness.posts.filter((p) => p.endpoint === 'kickoff')).toEqual([])
  })

  it('backs off 5 s then 10 s on transient token errors', async () => {
    let calls = 0
    const harness = createHarness({
      requestToken: async () => {
        calls += 1
        if (calls < 3) throw new NativeError('googleServerUnavailable')
        return 'integrity.token'
      },
    })

    await expect(kickoff(harness)).resolves.toMatchObject({ importId: 'imp_1' })
    expect(harness.dependencies.sleep).toHaveBeenNthCalledWith(1, 5_000)
    expect(harness.dependencies.sleep).toHaveBeenNthCalledWith(2, 10_000)
  })

  it('stretches each token backoff by up to half again at random', async () => {
    let calls = 0
    const harness = createHarness({
      random: () => 0.5,
      requestToken: async () => {
        calls += 1
        if (calls < 3) throw new NativeError('tooManyRequests')
        return 'integrity.token'
      },
    })

    await expect(kickoff(harness)).resolves.toMatchObject({ importId: 'imp_1' })
    expect(harness.dependencies.sleep).toHaveBeenNthCalledWith(1, 6_250)
    expect(harness.dependencies.sleep).toHaveBeenNthCalledWith(2, 12_500)
  })

  it('keeps every jittered wait between the base and one and a half times it', () => {
    for (const r of [0, 0.25, 0.999]) {
      const first = tokenRetryDelayMs(0, () => r)!
      const second = tokenRetryDelayMs(1, () => r)!
      expect(first).toBeGreaterThanOrEqual(5_000)
      expect(first).toBeLessThan(7_500)
      expect(second).toBeGreaterThanOrEqual(10_000)
      expect(second).toBeLessThan(15_000)
    }
    expect(tokenRetryDelayMs(2)).toBeUndefined()
  })

  it('reports an unreachable capability probe as a network failure, not an outage', async () => {
    const harness = createHarness({
      getStatus: async () => {
        throw new NotesImportAppAttestHttpError({ kind: 'network' })
      },
    })
    await expect(kickoff(harness)).rejects.toMatchObject({ code: 'network' })
  })

  it('reports a failing capability probe as protocolUnavailable', async () => {
    const harness = createHarness({
      getStatus: async () => {
        throw new NotesImportAppAttestHttpError({ kind: 'http', status: 503 })
      },
    })
    await expect(kickoff(harness)).rejects.toMatchObject({
      code: 'protocolUnavailable',
    })
  })

  it('surfaces a persistent network failure after the retries', async () => {
    const harness = createHarness({
      requestToken: async () => {
        throw new NativeError('network')
      },
    })

    await expect(kickoff(harness)).rejects.toMatchObject({ code: 'network' })
    expect(
      harness.dependencies.playIntegrity.requestToken
    ).toHaveBeenCalledTimes(3)
  })

  it.each([
    ['no Play Integrity capability', { available: true, capabilities: {} }],
    [
      'an unsupported protocol',
      {
        capabilities: {
          playIntegrity: { protocolVersions: [2], cloudProjectNumber: '1' },
        },
      },
    ],
    [
      'a malformed project number',
      {
        capabilities: {
          playIntegrity: { protocolVersions: [1], cloudProjectNumber: 'abc' },
        },
      },
    ],
  ])('refuses to attest against %s', async (_name, status) => {
    const harness = createHarness({ status })
    await expect(kickoff(harness)).rejects.toMatchObject({
      code: 'protocolUnavailable',
    })
    expect(harness.posts).toEqual([])
  })

  it('negotiates the capability once per session', async () => {
    const harness = createHarness()
    await kickoff(harness)
    await kickoff(harness)
    expect(harness.dependencies.transport.getStatus).toHaveBeenCalledTimes(1)
  })

  it('fails as unsupported off Android', async () => {
    const harness = createHarness({ supported: false })
    await expect(kickoff(harness)).rejects.toMatchObject({
      code: 'unsupported',
    })
  })

  it('never uses the legacy synchronous endpoint', async () => {
    const harness = createHarness()
    await expect(
      harness.module.post({
        endpoint: 'legacy',
        payload: PAYLOAD,
        contentHash: CONTENT_HASH,
      })
    ).rejects.toMatchObject({ code: 'protocolUnavailable' })
  })

  it('honors cancellation before any request', async () => {
    const harness = createHarness()
    const controller = new AbortController()
    controller.abort()
    await expect(kickoff(harness, controller.signal)).rejects.toMatchObject({
      code: 'cancelled',
    })
    expect(harness.posts).toEqual([])
  })

  it('uses the development bypass without touching Play', async () => {
    const harness = createHarness({ devBypass: true })

    await kickoff(harness)

    expect(harness.posts).toEqual([
      {
        endpoint: 'kickoff',
        body: {
          ...PAYLOAD,
          protocolVersion: 2,
          operation: 'assert',
          purpose: 'notes-import-kickoff',
          operationId: 'operation-1',
          requestHash: REQUEST_HASH,
          contentHash: CONTENT_HASH,
          uuid: 'install-uuid-1',
          accountId: 'account-id-1',
        },
        headers: { 'x-ww-dev-bypass': 'bypass' },
      },
    ])
    expect(
      harness.dependencies.playIntegrity.requestToken
    ).not.toHaveBeenCalled()
  })

  it('proves the full path with the verify probe and a redacted report', async () => {
    const harness = createHarness()

    const report = await harness.module.runRepair()

    expect(report).toMatchObject({
      ok: true,
      protocolVersion: 1,
      keyRotated: false,
    })
    expect(report.steps.map((step) => step.step)).toEqual([
      'supported',
      'capability',
      'challenge',
      'token',
      'verify',
    ])
    const verify = harness.posts.find((post) => post.endpoint === 'verify')
    expect(verify?.body).toMatchObject({
      purpose: 'notes-import-verify',
      contentHash: DIAGNOSTIC_CONTENT_HASH,
      requestHash: DIAGNOSTIC_CONTENT_HASH,
    })
    const output = JSON.stringify({
      report,
      snapshot: harness.module.getSnapshot(),
    })
    for (const secret of [
      'install-uuid-1',
      'account-id-1',
      CHALLENGE,
      'integrity.token',
    ]) {
      expect(output).not.toContain(secret)
    }
  })

  it('reports the failing diagnostics step', async () => {
    const harness = createHarness({
      requestToken: async () => {
        throw new NativeError('playServicesOutdated')
      },
    })

    const report = await harness.module.runDiagnostics()

    expect(report.ok).toBe(false)
    expect(report.steps.at(-1)).toMatchObject({
      step: 'token',
      ok: false,
      code: 'playServicesUnavailable',
    })
  })

  it('rejects a verify acknowledgement for another operation', async () => {
    const harness = createHarness({
      post: (endpoint, body) =>
        endpoint === 'challenge'
          ? {
              attestationProvider: 'play-integrity',
              operationId: body.operationId,
              challenge: CHALLENGE,
            }
          : {
              ok: true,
              attestationProvider: 'play-integrity',
              protocolVersion: 1,
              operationId: 'other',
            },
    })

    const report = await harness.module.runDiagnostics()
    expect(report.ok).toBe(false)
    expect(report.steps.at(-1)).toMatchObject({
      step: 'verify',
      code: 'authorizationFailed',
    })
  })

  it('snapshots provider state without identifiers', () => {
    expect(createHarness().module.getSnapshot()).toEqual({
      provider: 'play-integrity',
      baseUrl: 'https://api.example',
      devBypassEnabled: false,
      playIntegritySupported: true,
      negotiatedProtocolVersion: null,
      installIdentity: 'present',
      accountIdentity: 'adopted',
    })
  })
})
