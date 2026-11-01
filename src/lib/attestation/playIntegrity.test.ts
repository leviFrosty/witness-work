import { createHash } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import {
  DIAGNOSTIC_CONTENT_HASH,
  AttestationError,
  AttestationHttpError,
  type AttestationEndpoint,
  type AttestationProof,
} from '@/lib/attestation/appAttest'
import {
  buildPlayIntegrityClientData,
  createPlayIntegrityAuthorizer,
  tokenRetryDelayMs,
  type PlayIntegrityDependencies,
  type PlayIntegrityNativeFailureCode,
} from '@/lib/attestation/playIntegrity'

const SESSION_HASH = 'd'.repeat(64)
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

type Call = AttestationEndpoint | 'submit'

type PostHandler = (
  endpoint: Call,
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
    endpoint: Call
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
        : { ok: true }
  const dependencies: PlayIntegrityDependencies = {
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
      }) as PlayIntegrityDependencies['transport']['post'],
    },
    devBypass: { enabled: options.devBypass ?? false, token: 'bypass' },
    baseUrl: 'https://api.example',
    now: () => 0,
    sleep: vi.fn(async () => {}),
    random: options.random ?? (() => 0),
  }

  const submit = async (proof: AttestationProof) => {
    const body =
      proof.kind === 'attestation' ? proof.fields : { devBypass: proof.token }
    posts.push({ endpoint: 'submit', body, headers: undefined })
    const result = await (options.post ?? defaultPost)('submit', body)
    if (result instanceof Error) throw result
    return result
  }
  return {
    dependencies,
    posts,
    submit,
    module: createPlayIntegrityAuthorizer(dependencies),
  }
}

const attest = (
  harness: ReturnType<typeof createHarness>,
  signal?: AbortSignal
) =>
  harness.module.assert<unknown>({
    purpose: 'account-session',
    contentHash: SESSION_HASH,
    requestHash: SESSION_HASH,
    submit: (proof) => harness.submit(proof),
    signal,
  })

const httpError = (status: number, reason: string, serverCode?: string) =>
  new AttestationHttpError({
    kind: 'http',
    status,
    reason,
    serverCode: serverCode ?? 'attestation_failed',
    action: 'start_new_operation',
  })

describe('buildPlayIntegrityClientData', () => {
  it('matches ww-api byte for byte, leaving the account id slot empty', async () => {
    const clientData = buildPlayIntegrityClientData({
      purpose: 'attestation-verify',
      operationId: 'play-operation-1',
      challenge: CHALLENGE,
      uuid: '65A8B00C-DA7A-4E0A-BA5C-8E3D1B8C5F1C',
      contentHash: DIAGNOSTIC_CONTENT_HASH,
      requestHash: DIAGNOSTIC_CONTENT_HASH,
    })
    expect(clientData).toBe(
      `witnesswork.play-integrity|1|assert|attestation-verify|play-operation-1|${CHALLENGE}|65A8B00C-DA7A-4E0A-BA5C-8E3D1B8C5F1C||${DIAGNOSTIC_CONTENT_HASH}|${DIAGNOSTIC_CONTENT_HASH}`
    )

    await expect(sha256Hex(clientData)).resolves.toBe(
      'c62e4580fc1d9750b190749f1219c67f552a7d7c49e58d42287566f5661698e3'
    )
  })
})

describe('Play Integrity authorizer', () => {
  it.each(['challenge_expired', 'integrity_token_invalid'])(
    'retries once under a fresh operation after %s',
    async (reason) => {
      let submits = 0
      const harness = createHarness({
        post: (endpoint, body) => {
          if (endpoint === 'challenge') {
            return {
              attestationProvider: 'play-integrity',
              operationId: body.operationId,
              challenge: CHALLENGE,
            }
          }
          submits += 1
          return submits === 1 ? httpError(401, reason) : { opened: 2 }
        },
      })

      await expect(attest(harness)).resolves.toEqual({ opened: 2 })
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

    await expect(attest(harness)).rejects.toMatchObject({
      code: 'challengeExpired',
      reason: 'challenge_not_found',
    })
    expect(harness.posts.filter((p) => p.endpoint === 'submit')).toHaveLength(2)
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
          : new AttestationHttpError({
              kind: 'http',
              status: 403,
              reason,
              serverCode: 'attestation_failed',
              action: 'none',
            }),
    })

    const error = await attest(harness).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(AttestationError)
    expect(error).toMatchObject({ code, reason })
  })

  it('passes other refusals through as the server’s own codes', async () => {
    const denial = new AttestationHttpError({
      kind: 'http',
      status: 426,
      serverCode: 'upgrade_required',
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

    await expect(attest(harness)).rejects.toBe(denial)
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

    await expect(attest(harness)).rejects.toMatchObject({ code })
    expect(
      harness.dependencies.playIntegrity.requestToken
    ).toHaveBeenCalledTimes(1)
    expect(harness.posts.filter((p) => p.endpoint === 'submit')).toEqual([])
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

    await expect(attest(harness)).resolves.toEqual({ ok: true })
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

    await expect(attest(harness)).resolves.toEqual({ ok: true })
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
        throw new AttestationHttpError({ kind: 'network' })
      },
    })
    await expect(attest(harness)).rejects.toMatchObject({ code: 'network' })
  })

  it('reports a failing capability probe as protocolUnavailable', async () => {
    const harness = createHarness({
      getStatus: async () => {
        throw new AttestationHttpError({ kind: 'http', status: 503 })
      },
    })
    await expect(attest(harness)).rejects.toMatchObject({
      code: 'protocolUnavailable',
    })
  })

  it('surfaces a persistent network failure after the retries', async () => {
    const harness = createHarness({
      requestToken: async () => {
        throw new NativeError('network')
      },
    })

    await expect(attest(harness)).rejects.toMatchObject({ code: 'network' })
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
    await expect(attest(harness)).rejects.toMatchObject({
      code: 'protocolUnavailable',
    })
    expect(harness.posts).toEqual([])
  })

  it('negotiates the capability once per session', async () => {
    const harness = createHarness()
    await attest(harness)
    await attest(harness)
    expect(harness.dependencies.transport.getStatus).toHaveBeenCalledTimes(1)
  })

  it('fails as unsupported off Android', async () => {
    const harness = createHarness({ supported: false })
    await expect(attest(harness)).rejects.toMatchObject({
      code: 'unsupported',
    })
  })

  it('honors cancellation before any request', async () => {
    const harness = createHarness()
    const controller = new AbortController()
    controller.abort()
    await expect(attest(harness, controller.signal)).rejects.toMatchObject({
      code: 'cancelled',
    })
    expect(harness.posts).toEqual([])
  })
})

describe('Play Integrity diagnostics and repair', () => {
  it('sends the exact verify probe through /attestation/v1', async () => {
    const harness = createHarness()

    const report = await harness.module.runDiagnostics()

    expect(report.ok).toBe(true)
    const fields = {
      attestationProvider: 'play-integrity',
      protocolVersion: 1,
      operation: 'assert',
      operationId: 'operation-2',
      uuid: 'install-uuid-1',
      purpose: 'attestation-verify',
      contentHash: DIAGNOSTIC_CONTENT_HASH,
      requestHash: DIAGNOSTIC_CONTENT_HASH,
    }
    expect(harness.posts).toEqual([
      { endpoint: 'challenge', body: fields, headers: undefined },
      {
        endpoint: 'verify',
        body: {
          ...fields,
          challenge: CHALLENGE,
          integrityToken: 'integrity.token',
        },
        headers: undefined,
      },
    ])
    const binding = await sha256Hex(
      `witnesswork.play-integrity|1|assert|attestation-verify|operation-2|${CHALLENGE}|install-uuid-1||${DIAGNOSTIC_CONTENT_HASH}|${DIAGNOSTIC_CONTENT_HASH}`
    )
    expect(
      harness.dependencies.playIntegrity.requestToken
    ).toHaveBeenCalledWith('123456789012', binding)
  })

  it('proves the development bypass with the verify probe', async () => {
    const harness = createHarness({ devBypass: true, supported: false })

    const report = await harness.module.runDiagnostics()

    expect(report).toMatchObject({ ok: true, steps: [{ step: 'verify' }] })
    expect(harness.posts).toEqual([
      {
        endpoint: 'verify',
        body: {
          protocolVersion: 2,
          operation: 'assert',
          purpose: 'attestation-verify',
          operationId: 'operation-1',
          contentHash: DIAGNOSTIC_CONTENT_HASH,
          requestHash: DIAGNOSTIC_CONTENT_HASH,
          uuid: 'install-uuid-1',
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
      purpose: 'attestation-verify',
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

describe('Play Integrity for other features (assert)', () => {
  const SESSION_HASH = 'd'.repeat(64)

  const channel = (
    submit: (proof: unknown, call: number) => unknown = () => ({ ok: true })
  ) => {
    const challenges: Record<string, unknown>[] = []
    const proofs: unknown[] = []
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
            attestationProvider: 'play-integrity',
            protocolVersion: 1,
            operation: 'assert',
            operationId: body.operationId,
            challenge: CHALLENGE,
            expiresAt: 1,
          }
        },
        submit: async (proof: unknown) => {
          proofs.push(proof)
          const result = submit(proof, proofs.length - 1)
          if (result instanceof Error) throw result
          return result
        },
      },
    }
  }

  it('gets the challenge from /attestation/v1 when the feature has no route of its own', async () => {
    const harness = createHarness()
    const { challenge: _own, ...request } = channel().request

    await expect(harness.module.assert(request)).resolves.toEqual({ ok: true })

    expect(harness.posts.map((post) => post.endpoint)).toEqual(['challenge'])
    expect(harness.posts[0].body).toMatchObject({
      attestationProvider: 'play-integrity',
      purpose: 'account-session',
      contentHash: SESSION_HASH,
    })
  })

  it('binds the token to the session hashes without an install account id', async () => {
    const harness = createHarness()
    const routes = channel()

    await harness.module.assert(routes.request)

    const fields = {
      attestationProvider: 'play-integrity',
      protocolVersion: 1,
      operation: 'assert',
      operationId: 'operation-1',
      uuid: 'install-uuid-1',
      purpose: 'account-session',
      contentHash: SESSION_HASH,
      requestHash: SESSION_HASH,
    }
    expect(routes.challenges).toEqual([fields])
    const binding = await sha256Hex(
      `witnesswork.play-integrity|1|assert|account-session|operation-1|${CHALLENGE}|install-uuid-1||${SESSION_HASH}|${SESSION_HASH}`
    )
    expect(
      harness.dependencies.playIntegrity.requestToken
    ).toHaveBeenCalledWith('123456789012', binding)
    expect(routes.proofs).toEqual([
      {
        kind: 'attestation',
        fields: {
          ...fields,
          challenge: CHALLENGE,
          integrityToken: 'integrity.token',
        },
      },
    ])
    expect(harness.posts).toEqual([])

    expect(harness.dependencies.playIntegrity.prepare).toHaveBeenCalledWith(
      '123456789012'
    )
  })

  it('restarts once for an invalid token and keeps device verdicts', async () => {
    const harness = createHarness()
    const retried = channel((_proof, call) =>
      call === 0
        ? new AttestationHttpError({
            kind: 'http',
            status: 403,
            serverCode: 'attestation_failed',
            reason: 'integrity_token_invalid',
          })
        : { ok: true }
    )
    await harness.module.assert(retried.request)
    expect(retried.challenges.map((body) => body.operationId)).toEqual([
      'operation-1',
      'operation-2',
    ])

    const refused = channel(
      () =>
        new AttestationHttpError({
          kind: 'http',
          status: 403,
          serverCode: 'attestation_failed',
          reason: 'device_integrity_failed',
        })
    )
    const error = await harness.module
      .assert(refused.request)
      .catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(AttestationError)
    expect(error).toMatchObject({
      code: 'deviceIneligible',
      reason: 'device_integrity_failed',
    })
  })

  it('sends the dev bypass instead of a token in dev builds', async () => {
    const harness = createHarness({ devBypass: true, supported: false })
    const routes = channel()

    await harness.module.assert(routes.request)

    expect(routes.challenges).toEqual([])
    expect(routes.proofs).toEqual([{ kind: 'devBypass', token: 'bypass' }])
  })

  it('checks Google Play before a flow that needs it', async () => {
    await expect(createHarness().module.checkSupport()).resolves.toBe(
      'supported'
    )
    await expect(
      createHarness({ supported: false }).module.checkSupport()
    ).resolves.toBe('unsupported')

    const noPlay = createHarness()
    vi.mocked(noPlay.dependencies.playIntegrity.prepare).mockRejectedValue(
      new NativeError('playStoreNotFound')
    )
    await expect(noPlay.module.checkSupport()).resolves.toBe('unsupported')

    const offline = createHarness()
    vi.mocked(offline.dependencies.playIntegrity.prepare).mockRejectedValue(
      new NativeError('network')
    )
    await expect(offline.module.checkSupport()).resolves.toBe('unknown')

    const noWorker = createHarness({
      getStatus: async () => {
        throw new AttestationHttpError({ kind: 'network' })
      },
    })
    await expect(noWorker.module.checkSupport()).resolves.toBe('unknown')
    expect(
      noWorker.dependencies.playIntegrity.requestToken
    ).not.toHaveBeenCalled()
  })
})
