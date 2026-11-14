import { afterEach, describe, expect, it, vi } from 'vitest'
import { makeMemoryKv } from '../test/memoryKv'
import { sha256Hex } from '../crypto'
import type { AppContext, Environment } from '../types'
import { handleNotesImportKickoffRequest } from './route'
import {
  handleAttestationChallengeRequest,
  handleAttestationRegisterRequest,
  handleAttestationVerifyRequest,
} from '../attestation/route'

const UUID = '65A8B00C-DA7A-4E0A-BA5C-8E3D1B8C5F1C'
const CONTENT_HASH = 'a'.repeat(64)
const GOLDEN_NOTES_TEXT = 'Met Ana\nReturn Tuesday'
const GOLDEN_CONTENT_HASH =
  'e0129726d5d80305a40c79da48fae94cdf34a3e95b8a476c5287f268699d7097'
const GOLDEN_REQUEST_HASH =
  '022bb5d93a09241655bf5a32a2b25308b15e3bc75ebfd4524685c9a90b603148'
const GOLDEN_CONTEXT = {
  existingContacts: [
    { name: 'Zoe', id: 'contact-2' },
    { id: 'contact-1', name: 'Ana' },
  ],
  categories: ['Return Visit', 'Bible Study'],
  locale: 'en-US',
}

const context = (
  environment: Environment,
  options: {
    body?: unknown
    text?: string
    headers?: Record<string, string>
  } = {}
): AppContext =>
  ({
    env: {
      APP_ATTEST_ENVIRONMENT: environment.NOTES_IMPORT_DEV_BYPASS_TOKEN
        ? 'development'
        : 'production',
      ...environment,
    },
    req: {
      text: async () =>
        options.text ??
        (options.body === undefined ? '' : JSON.stringify(options.body)),
      json: async () => options.body,
      header: (name: string) => options.headers?.[name.toLowerCase()],
    },
    json: (body: unknown, status = 200) => Response.json(body, { status }),
  }) as unknown as AppContext

const makeKickoffEnvironment = async (devBypassToken?: string) => {
  const kv = makeMemoryKv()
  await kv.put('notes-import:provider-health', 'up')
  const verifyAssertion = vi.fn(async () => ({
    ok: true as const,
    value: {
      ok: true as const,
      protocolVersion: 2 as const,
      operationId: 'assert-operation-1',
    },
  }))
  const credits = {
    remaining: 4,
    limit: 5,
    resetsAt: null,
    isSupporter: false,
    refinements: { remaining: 5, limit: 5 },
  }
  const index = {
    checkCredit: vi.fn(async () => ({
      decision: {
        allowed: true,
        isNewHash: true,
        isRefinement: false,
        remaining: 4,
      },
      credits,
    })),
    acquire: vi.fn(async () => ({ ok: true as const, active: 1 })),
    kickoffCredits: vi.fn(async () => credits),
    release: vi.fn(async () => undefined),
  }
  const start = vi.fn(async () => 'started' as const)
  const environment = {
    NOTES_KV: kv,
    APPLE_TEAM_ID: 'ABCDE12345',
    IOS_BUNDLE_ID: 'com.example.app',
    OPENROUTER_API_KEY: 'openrouter-test',
    REVENUECAT_API_KEY: 'revenuecat-test',
    NOTES_IMPORT_DEV_BYPASS_TOKEN: devBypassToken,
    APP_ATTEST_IDENTITY: {
      idFromName: () => ({ toString: () => 'identity-id' }),
      get: () => ({ verifyAssertion }),
    },
    NOTES_IMPORT_INDEX: {
      idFromName: () => ({ toString: () => 'index-id' }),
      get: () => index,
    },
    NOTES_IMPORT_RUN: {
      idFromName: () => ({ toString: () => 'run-id' }),
      get: () => ({ start }),
    },
  } as unknown as Environment
  return { environment, verifyAssertion, index, start, credits }
}

describe('App Attest route compatibility', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it.each([null, [], 'scalar', 17, true])(
    'rejects non-object JSON %j on every changed POST route',
    async (invalidBody) => {
      const kv = makeMemoryKv()
      await kv.put('notes-import:provider-health', 'up')
      const environment = {
        NOTES_KV: kv,
      } as unknown as Environment
      const requests = [
        () => handleAttestationChallengeRequest(context(environment, { body: invalidBody })),
        () => handleAttestationRegisterRequest(context(environment, { body: invalidBody })),
        () =>
          handleAttestationVerifyRequest(
            context(environment, { body: invalidBody })
          ),
        () =>
          handleNotesImportKickoffRequest(
            context(environment, { body: invalidBody })
          ),
      ]

      for (const request of requests) {
        const response = await request()
        expect(response.status).toBe(400)
        await expect(response.json()).resolves.toMatchObject({
          code: 'bad_request',
        })
      }
    }
  )

  it('keeps accepting an empty challenge POST and returns only challenge', async () => {
    const kv = makeMemoryKv()
    const environment = {
      NOTES_KV: kv,
    } as unknown as Environment

    const response = await handleAttestationChallengeRequest(context(environment))
    const body = (await response.json()) as Record<string, unknown>

    expect(response.status).toBe(200)
    expect(Object.keys(body)).toEqual(['challenge'])
    expect(body.challenge).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(kv.store.get(`chal:${body.challenge as string}`)).toBe('1')
  })

  it('carries every protected field into a v2 assertion challenge descriptor', async () => {
    const issueChallenge = vi.fn(async (request: Record<string, unknown>) => ({
      ok: true as const,
      value: {
        protocolVersion: 2 as const,
        operation: 'assert' as const,
        operationId: request.operationId as string,
        challenge: 'C'.repeat(43),
        expiresAt: 1_800_000,
      },
    }))
    const environment = {
      APP_ATTEST_IDENTITY: {
        idFromName: () => ({ toString: () => 'identity-id' }),
        get: () => ({ issueChallenge }),
      },
    } as unknown as Environment
    const body = {
      protocolVersion: 2,
      operation: 'assert',
      operationId: 'assert-operation-1',
      uuid: UUID,
      keyId: `${'A'.repeat(43)}=`,
      purpose: 'notes-import-kickoff',
      accountId: 'account-id',
      contentHash: GOLDEN_CONTENT_HASH,
      requestHash: GOLDEN_REQUEST_HASH,
    }

    const response = await handleAttestationChallengeRequest(
      context(environment, { body })
    )

    expect(response.status).toBe(200)
    expect(issueChallenge).toHaveBeenCalledWith(body)
  })

  it('keeps the v1 attest body and { ok: true } response unchanged', async () => {
    const register = vi.fn(async () => ({ ok: true, value: { ok: true } }))
    const environment = {
      NOTES_KV: makeMemoryKv(),
      APP_ATTEST_IDENTITY: {
        idFromName: () => ({ toString: () => 'identity-id' }),
        get: () => ({ register }),
      },
    } as unknown as Environment
    const body = {
      uuid: UUID,
      keyId: 'legacy-key-id',
      challenge: 'legacy-challenge',
      attestation: 'legacy-attestation',
    }

    const response = await handleAttestationRegisterRequest(context(environment, { body }))

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ ok: true })
    expect(register).toHaveBeenCalledWith({ protocolVersion: 1, ...body })
  })

  it('adds stable v2 reason/action fields while retaining legacy top-level fields', async () => {
    const register = vi.fn(async () => ({
      ok: false as const,
      error: {
        reason: 'recovery_token_mismatch' as const,
        action: 'none' as const,
        message: 'recovery token did not match',
        status: 401,
      },
    }))
    const environment = {
      APP_ATTEST_IDENTITY: {
        idFromName: () => ({ toString: () => 'identity-id' }),
        get: () => ({ register }),
      },
    } as unknown as Environment
    const body = {
      protocolVersion: 2,
      operation: 'bind',
      operationId: 'bind-operation-1',
      uuid: UUID,
      keyId: `${'A'.repeat(43)}=`,
      challenge: 'C'.repeat(43),
      attestation: 'attestation',
      recoveryToken: 'R'.repeat(43),
    }
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)

    const response = await handleAttestationRegisterRequest(context(environment, { body }))

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'recovery token did not match',
      code: 'attestation_failed',
      reason: 'recovery_token_mismatch',
      action: 'none',
    })
  })

  it('keeps the v1 verify body and { ok: true } response unchanged', async () => {
    const verifyAssertion = vi.fn(async () => ({ ok: true, value: { ok: true } }))
    const environment = {
      APP_ATTEST_IDENTITY: {
        idFromName: () => ({ toString: () => 'identity-id' }),
        get: () => ({ verifyAssertion }),
      },
    } as unknown as Environment
    const body = {
      uuid: UUID,
      keyId: 'legacy-key-id',
      challenge: 'legacy-challenge',
      assertion: 'legacy-assertion',
      contentHash: CONTENT_HASH,
    }

    const response = await handleAttestationVerifyRequest(
      context(environment, { body })
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ ok: true })
    expect(verifyAssertion).toHaveBeenCalledWith({
      protocolVersion: 1,
      assertion: body.assertion,
      keyId: body.keyId,
      challenge: body.challenge,
      uuid: body.uuid,
      accountId: undefined,
      contentHash: body.contentHash,
    })
  })

  it.each([
    ['assertion_invalid', 'assertion_failed', 401],
    ['challenge_not_found', 'challenge_expired', 401],
    ['challenge_expired', 'challenge_expired', 401],
    ['counter_not_increasing', 'counter_conflict', 401],
    ['identity_not_bound', 'device_verification_failed', 401],
    ['key_not_active', 'device_verification_failed', 401],
    ['storage_unavailable', 'server_error', 503],
  ] as const)(
    'maps v1 %s to non-rotating top-level code %s',
    async (reason, expectedCode, expectedStatus) => {
      const verifyAssertion = vi.fn(async () => ({
        ok: false as const,
        error: {
          reason,
          action: reason === 'storage_unavailable' ? ('retry' as const) : ('none' as const),
          message: 'App Attest request rejected',
          status: expectedStatus,
        },
      }))
      const environment = {
        APP_ATTEST_IDENTITY: {
          idFromName: () => ({ toString: () => 'identity-id' }),
          get: () => ({ verifyAssertion }),
        },
      } as unknown as Environment
      const body = {
        uuid: UUID,
        keyId: 'legacy-key-id',
        challenge: 'legacy-challenge',
        assertion: 'legacy-assertion',
        contentHash: CONTENT_HASH,
      }
      vi.spyOn(console, 'warn').mockImplementation(() => undefined)

      const response = await handleAttestationVerifyRequest(
        context(environment, { body })
      )

      expect(response.status).toBe(expectedStatus)
      await expect(response.json()).resolves.toMatchObject({
        code: expectedCode,
        reason,
      })
      expect(expectedCode).not.toBe('attestation_failed')
      expect(expectedCode).not.toBe('attestation_required')
    }
  )

  it('carries requestHash through a v2 verify assertion and signs it separately from contentHash', async () => {
    const verifyAssertion = vi.fn(async () => ({
      ok: true as const,
      value: {
        ok: true as const,
        protocolVersion: 2 as const,
        operationId: 'verify-operation-1',
      },
    }))
    const environment = {
      APP_ATTEST_IDENTITY: {
        idFromName: () => ({ toString: () => 'identity-id' }),
        get: () => ({ verifyAssertion }),
      },
    } as unknown as Environment
    const body = {
      protocolVersion: 2,
      operation: 'assert',
      operationId: 'verify-operation-1',
      purpose: 'notes-import-verify',
      uuid: UUID,
      accountId: 'account-id',
      keyId: `${'A'.repeat(43)}=`,
      challenge: 'C'.repeat(43),
      assertion: 'assertion',
      contentHash: CONTENT_HASH,
      requestHash: CONTENT_HASH,
    }

    const response = await handleAttestationVerifyRequest(
      context(environment, { body })
    )

    expect(response.status).toBe(200)
    expect(verifyAssertion).toHaveBeenCalledWith(body)
  })

  it('proves the configured dev bypass through the protected verify route', async () => {
    const { environment, verifyAssertion } =
      await makeKickoffEnvironment('bypass-token')
    const body = {
      protocolVersion: 2,
      operation: 'assert',
      operationId: 'verify-bypass-operation',
      purpose: 'notes-import-verify',
      uuid: UUID,
      accountId: 'account-id',
      contentHash: CONTENT_HASH,
      requestHash: CONTENT_HASH,
    }

    const response = await handleAttestationVerifyRequest(
      context(environment, {
        body,
        headers: { 'x-ww-dev-bypass': 'bypass-token' },
      })
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      ok: true,
      protocolVersion: 2,
      operationId: body.operationId,
    })
    expect(verifyAssertion).not.toHaveBeenCalled()
  })

  it('requires requestHash to equal contentHash on v2 verify', async () => {
    const verifyAssertion = vi.fn()
    const environment = {
      APP_ATTEST_IDENTITY: {
        idFromName: () => ({ toString: () => 'identity-id' }),
        get: () => ({ verifyAssertion }),
      },
    } as unknown as Environment
    const body = {
      protocolVersion: 2,
      operation: 'assert',
      operationId: 'verify-operation-1',
      purpose: 'notes-import-verify',
      uuid: UUID,
      accountId: 'account-id',
      keyId: `${'A'.repeat(43)}=`,
      challenge: 'C'.repeat(43),
      assertion: 'assertion',
      contentHash: CONTENT_HASH,
      requestHash: 'b'.repeat(64),
    }

    const response = await handleAttestationVerifyRequest(
      context(environment, { body })
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({
      code: 'bad_request',
      reason: 'invalid_request',
    })
    expect(verifyAssertion).not.toHaveBeenCalled()
  })

  it('keeps a deployed v1 kickoff body on the shared protected route', async () => {
    const kv = makeMemoryKv()
    await kv.put('notes-import:provider-health', 'up')
    const verifyAssertion = vi.fn(async () => ({ ok: true, value: { ok: true } }))
    const credits = {
      remaining: 4,
      limit: 5,
      resetsAt: null,
      isSupporter: false,
      refinements: { remaining: 5, limit: 5 },
    }
    const index = {
      checkCredit: vi.fn(async () => ({
        decision: {
          allowed: true,
          isNewHash: true,
          isRefinement: false,
          remaining: 4,
        },
        credits,
      })),
      acquire: vi.fn(async () => ({ ok: true, active: 1 })),
      kickoffCredits: vi.fn(async () => credits),
      release: vi.fn(async () => undefined),
    }
    const environment = {
      NOTES_KV: kv,
      APPLE_TEAM_ID: 'ABCDE12345',
      IOS_BUNDLE_ID: 'com.example.app',
      OPENROUTER_API_KEY: 'openrouter-test',
      REVENUECAT_API_KEY: 'revenuecat-test',
      APP_ATTEST_IDENTITY: {
        idFromName: () => ({ toString: () => 'identity-id' }),
        get: () => ({ verifyAssertion }),
      },
      NOTES_IMPORT_INDEX: {
        idFromName: () => ({ toString: () => 'index-id' }),
        get: () => index,
      },
      NOTES_IMPORT_RUN: {
        idFromName: () => ({ toString: () => 'run-id' }),
        get: () => ({ start: vi.fn(async () => 'started') }),
      },
    } as unknown as Environment
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(null, { status: 404 }))
    )
    const notesText = 'v1 route compatibility'
    const contentHash = await sha256Hex(notesText)
    const body = {
      uuid: UUID,
      notesText,
      contentHash,
      context: {},
      keyId: 'legacy-key-id',
      challenge: 'legacy-challenge',
      assertion: 'legacy-assertion',
    }

    const response = await handleNotesImportKickoffRequest(
      context(environment, { body })
    )
    const responseBody = (await response.json()) as Record<string, unknown>

    expect(response.status).toBe(200)
    expect(responseBody).toMatchObject({ refinement: false, credits })
    expect(responseBody.importId).toMatch(/^imp_[a-f0-9]{40}$/)
    expect(responseBody.subscribeToken).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(verifyAssertion).toHaveBeenCalledWith({
      protocolVersion: 1,
      assertion: body.assertion,
      keyId: body.keyId,
      challenge: body.challenge,
      uuid: body.uuid,
      accountId: undefined,
      contentHash,
    })
  })

  it('recomputes and carries the canonical requestHash through v2 kickoff', async () => {
    const { environment, verifyAssertion, credits } =
      await makeKickoffEnvironment()
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(null, { status: 404 }))
    )
    const body = {
      protocolVersion: 2,
      operation: 'assert',
      operationId: 'assert-operation-1',
      purpose: 'notes-import-kickoff',
      uuid: UUID,
      accountId: 'account-id',
      notesText: GOLDEN_NOTES_TEXT,
      context: GOLDEN_CONTEXT,
      contentHash: GOLDEN_CONTENT_HASH,
      requestHash: GOLDEN_REQUEST_HASH,
      keyId: `${'A'.repeat(43)}=`,
      challenge: 'C'.repeat(43),
      assertion: 'assertion',
    }

    const response = await handleNotesImportKickoffRequest(
      context(environment, { body })
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      refinement: false,
      credits,
    })
    expect(verifyAssertion).toHaveBeenCalledWith({
      protocolVersion: 2,
      operation: 'assert',
      operationId: 'assert-operation-1',
      purpose: 'notes-import-kickoff',
      uuid: UUID,
      accountId: 'account-id',
      contentHash: GOLDEN_CONTENT_HASH,
      requestHash: GOLDEN_REQUEST_HASH,
      keyId: `${'A'.repeat(43)}=`,
      challenge: 'C'.repeat(43),
      assertion: 'assertion',
    })
  })

  it('tells a capped kickoff when to look for a free slot', async () => {
    const { environment, index, start } = await makeKickoffEnvironment()
    index.acquire.mockResolvedValueOnce({ ok: false, active: 2 } as never)
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(null, { status: 404 }))
    )
    const response = await handleNotesImportKickoffRequest(
      context(environment, {
        body: {
          protocolVersion: 2,
          operation: 'assert',
          operationId: 'assert-operation-1',
          purpose: 'notes-import-kickoff',
          uuid: UUID,
          accountId: 'account-id',
          notesText: GOLDEN_NOTES_TEXT,
          context: GOLDEN_CONTEXT,
          contentHash: GOLDEN_CONTENT_HASH,
          requestHash: GOLDEN_REQUEST_HASH,
          keyId: `${'A'.repeat(43)}=`,
          challenge: 'C'.repeat(43),
          assertion: 'assertion',
        },
      })
    )

    expect(response.status).toBe(429)
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: expect.stringContaining('imports running'),
      code: 'active_cap',
      retryAfter: 15,
    })
    expect(start).not.toHaveBeenCalled()
  })

  it('rejects every kickoff payload mutation not covered by its claimed requestHash', async () => {
    const { environment, index } = await makeKickoffEnvironment('bypass-token')
    const baseBody = {
      protocolVersion: 2,
      operation: 'assert',
      operationId: 'assert-operation-1',
      purpose: 'notes-import-kickoff',
      uuid: UUID,
      accountId: 'account-id',
      notesText: GOLDEN_NOTES_TEXT,
      context: GOLDEN_CONTEXT,
      contentHash: GOLDEN_CONTENT_HASH,
      requestHash: GOLDEN_REQUEST_HASH,
    }
    const mutations = [
      {
        ...baseBody,
        context: { ...GOLDEN_CONTEXT, locale: 'fr-FR' },
      },
      {
        ...baseBody,
        refinement: {
          previousResultJSON: '{"summary":"Earlier"}',
          instruction: 'Try again',
        },
      },
      {
        ...baseBody,
        notesText: 'Changed notes',
        contentHash: await sha256Hex('Changed notes'),
      },
      { ...baseBody, requestHash: '0'.repeat(64) },
    ]

    for (const body of mutations) {
      const response = await handleNotesImportKickoffRequest(
        context(environment, {
          body,
          headers: { 'x-ww-dev-bypass': 'bypass-token' },
        })
      )
      expect(response.status).toBe(400)
      await expect(response.json()).resolves.toMatchObject({
        code: 'bad_request',
      })
    }
    expect(index.checkCredit).not.toHaveBeenCalled()
  })

  it('keeps the attested repair path open while the kill-switch disables imports', async () => {
    // The app's Tools-screen repair heals a key Apple refuses to sign with by
    // walking challenge → attest (rotate under the recovery token) → verify.
    // The kill-switch guards inference spend; these three routes spend none, so
    // disabling Notes Import must never close the repair path.
    const issueChallenge = vi.fn(async (request: Record<string, unknown>) => ({
      ok: true as const,
      value: {
        protocolVersion: 2 as const,
        operation: 'assert' as const,
        operationId: request.operationId as string,
        challenge: 'C'.repeat(43),
        expiresAt: 1_800_000,
      },
    }))
    const register = vi.fn(async () => ({
      ok: true as const,
      value: {
        ok: true as const,
        protocolVersion: 2 as const,
        operationId: 'bind-operation-1',
        status: 'rotated' as const,
        recoveryEnrolled: true as const,
      },
    }))
    const verifyAssertion = vi.fn(async () => ({
      ok: true as const,
      value: {
        ok: true as const,
        protocolVersion: 2 as const,
        operationId: 'verify-operation-1',
      },
    }))
    const kv = makeMemoryKv()
    await kv.put('notes-import:enabled', 'disabled')
    await kv.put('notes-import:provider-health', 'up')
    const environment = {
      NOTES_KV: kv,
      OPENROUTER_API_KEY: 'openrouter-test',
      APP_ATTEST_IDENTITY: {
        idFromName: () => ({ toString: () => 'identity-id' }),
        get: () => ({ issueChallenge, register, verifyAssertion }),
      },
    } as unknown as Environment

    const kickoff = await handleNotesImportKickoffRequest(
      context(environment, { body: {} })
    )
    expect(kickoff.status).toBe(503)
    await expect(kickoff.json()).resolves.toEqual({
      ok: false,
      error: 'Notes Import is temporarily unavailable',
      code: 'unavailable',
      detail: 'disabled',
      retryAfter: 60,
    })

    const challenge = await handleAttestationChallengeRequest(
      context(environment, {
        body: {
          protocolVersion: 2,
          operation: 'assert',
          operationId: 'assert-operation-1',
          uuid: UUID,
          keyId: `${'A'.repeat(43)}=`,
          purpose: 'notes-import-verify',
          accountId: 'account-id',
          contentHash: CONTENT_HASH,
          requestHash: CONTENT_HASH,
        },
      })
    )
    expect(challenge.status).toBe(200)
    expect(issueChallenge).toHaveBeenCalledTimes(1)

    const attest = await handleAttestationRegisterRequest(
      context(environment, {
        body: {
          protocolVersion: 2,
          operation: 'bind',
          operationId: 'bind-operation-1',
          uuid: UUID,
          keyId: `${'A'.repeat(43)}=`,
          challenge: 'C'.repeat(43),
          attestation: 'attestation',
          recoveryToken: 'R'.repeat(43),
        },
      })
    )
    expect(attest.status).toBe(200)
    await expect(attest.json()).resolves.toMatchObject({ status: 'rotated' })

    const verify = await handleAttestationVerifyRequest(
      context(environment, {
        body: {
          protocolVersion: 2,
          operation: 'assert',
          operationId: 'verify-operation-1',
          purpose: 'notes-import-verify',
          uuid: UUID,
          accountId: 'account-id',
          keyId: `${'A'.repeat(43)}=`,
          challenge: 'C'.repeat(43),
          assertion: 'assertion',
          contentHash: CONTENT_HASH,
          requestHash: CONTENT_HASH,
        },
      })
    )
    expect(verify.status).toBe(200)
    await expect(verify.json()).resolves.toMatchObject({ ok: true })
    expect(verifyAssertion).toHaveBeenCalledTimes(1)
  })
})
