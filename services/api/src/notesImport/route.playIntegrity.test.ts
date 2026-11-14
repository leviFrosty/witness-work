import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const analytics = vi.hoisted(() => ({ capture: vi.fn(async () => undefined) }))
vi.mock('../analytics', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../analytics')>()),
  captureAnalyticsEvent: analytics.capture,
}))

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

import { makeMemoryKv } from '../test/memoryKv'
import { createNamespace } from '../test/durableObjects'
import { createTestServiceAccount } from '../test/googleServiceAccount'
import type { AppContext, Environment } from '../types'
import { PlayIntegrityChallenges } from '../playIntegrity/challengeDO'
import { resetGoogleAuthState } from '../googleAuth'
import { computePlayIntegrityRequestBinding } from '../playIntegrity/protocol'
import { getNotesImportStatus, type StatusKv } from './status'
import {
  handleNotesImportKickoffRequest,
  handleNotesImportRequest,
} from './route'
import {
  handleAttestationChallengeRequest,
  handleAttestationRegisterRequest,
  handleAttestationVerifyRequest,
} from '../attestation/route'

const UUID = '65A8B00C-DA7A-4E0A-BA5C-8E3D1B8C5F1C'
const ACCOUNT_ID = 'account-id-1'
const PACKAGE = 'com.example.app'
const NOTES_TEXT = 'Met Ana\nReturn Tuesday'
const CONTENT_HASH =
  'e0129726d5d80305a40c79da48fae94cdf34a3e95b8a476c5287f268699d7097'
const REQUEST_HASH =
  '022bb5d93a09241655bf5a32a2b25308b15e3bc75ebfd4524685c9a90b603148'
const NOTES_CONTEXT = {
  existingContacts: [
    { name: 'Zoe', id: 'contact-2' },
    { id: 'contact-1', name: 'Ana' },
  ],
  categories: ['Return Visit', 'Bible Study'],
  locale: 'en-US',
}

const context = (
  env: Environment,
  options: { body?: unknown; headers?: Record<string, string> } = {}
): AppContext =>
  ({
    env,
    req: {
      text: async () =>
        options.body === undefined ? '' : JSON.stringify(options.body),
      json: async () => options.body,
      header: (name: string) => options.headers?.[name.toLowerCase()],
    },
    json: (body: unknown, status = 200) => Response.json(body, { status }),
  }) as unknown as AppContext

const challengeFields = (purpose: string, hashes = { CONTENT_HASH, REQUEST_HASH }) => ({
  attestationProvider: 'play-integrity',
  protocolVersion: 1,
  operation: 'assert',
  operationId: 'play-operation-1',
  uuid: UUID,
  accountId: ACCOUNT_ID,
  purpose,
  contentHash: hashes.CONTENT_HASH,
  requestHash: hashes.REQUEST_HASH,
})

const setup = async (
  verdicts: { device?: string[]; app?: string } = {}
) => {
  const kv = makeMemoryKv()
  await kv.put('notes-import:provider-health', 'up')
  const account = await createTestServiceAccount()
  const challenges = createNamespace(
    (state) => new PlayIntegrityChallenges(state, {} as Environment)
  )
  const credits = {
    remaining: 4,
    limit: 5,
    resetsAt: null,
    isSupporter: false,
    refinements: { remaining: 5, limit: 5 },
  }
  const index = {
    checkCredit: vi.fn(async () => ({
      decision: { allowed: true, isNewHash: true, isRefinement: false, remaining: 4 },
      credits,
    })),
    acquire: vi.fn(async () => ({ ok: true as const, active: 1 })),
    kickoffCredits: vi.fn(async () => credits),
    release: vi.fn(async () => undefined),
  }
  const indexNames: string[] = []
  const appAttestIdentity = { idFromName: vi.fn(), get: vi.fn() }
  const env = {
    APP_ATTEST_ENVIRONMENT: 'production',
    NOTES_KV: kv,
    OPENROUTER_API_KEY: 'openrouter-test',
    REVENUECAT_API_KEY: 'revenuecat-test',
    ANDROID_PACKAGE_NAME: PACKAGE,
    PLAY_INTEGRITY_CLOUD_PROJECT_NUMBER: '123456789012',
    PLAY_INTEGRITY_SERVICE_ACCOUNT_JSON: account.json,
    PLAY_INTEGRITY_CHALLENGES: challenges.namespace,
    APP_ATTEST_IDENTITY: appAttestIdentity,
    NOTES_IMPORT_INDEX: {
      idFromName: (name: string) => {
        indexNames.push(name)
        return { toString: () => name }
      },
      get: () => index,
    },
    NOTES_IMPORT_RUN: {
      idFromName: () => ({ toString: () => 'run-id' }),
      get: () => ({ start: vi.fn(async () => 'started' as const) }),
    },
  } as unknown as Environment

  // Google (token + decode) and RevenueCat (unknown subscriber → free meter).
  const decodeBodies: unknown[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url === 'https://oauth2.googleapis.com/token') {
        return Response.json({ access_token: 'ya29.test', expires_in: 3600 })
      }
      if (url.endsWith(':decodeIntegrityToken')) {
        decodeBodies.push(JSON.parse(String(init?.body)))
        return Response.json({
          tokenPayloadExternal: {
            requestDetails: {
              requestPackageName: PACKAGE,
              requestHash: pendingBinding,
              timestampMillis: String(Date.now()),
            },
            appIntegrity: {
              appRecognitionVerdict: verdicts.app ?? 'PLAY_RECOGNIZED',
              packageName: PACKAGE,
            },
            deviceIntegrity: {
              deviceRecognitionVerdict: verdicts.device ?? [
                'MEETS_DEVICE_INTEGRITY',
              ],
            },
          },
        })
      }
      if (url.startsWith('https://api.revenuecat.com/')) {
        return new Response(null, { status: 404 })
      }
      throw new Error(`Unexpected fetch ${url}`)
    })
  )

  let pendingBinding = ''
  /** Runs the real challenge round-trip, then "asks Play" for a bound token. */
  const signedBody = async (purpose: string, payload: Record<string, unknown>) => {
    const fields = challengeFields(
      purpose,
      purpose === 'notes-import-verify'
        ? { CONTENT_HASH, REQUEST_HASH: CONTENT_HASH }
        : { CONTENT_HASH, REQUEST_HASH }
    )
    const response = await handleAttestationChallengeRequest(context(env, { body: fields }))
    expect(response.status).toBe(200)
    const { challenge } = (await response.json()) as { challenge: string }
    pendingBinding = await computePlayIntegrityRequestBinding({
      ...(fields as never),
      challenge,
    })
    return { ...payload, ...fields, challenge, integrityToken: 'token.abc' }
  }

  return { env, index, indexNames, appAttestIdentity, signedBody, decodeBodies }
}

describe('Play Integrity on the Notes Import routes', () => {
  beforeEach(() => {
    resetGoogleAuthState()
    analytics.capture.mockClear()
  })
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('kicks off an import authorized by a bound integrity token', async () => {
    const { env, index, indexNames, appAttestIdentity, signedBody, decodeBodies } =
      await setup()
    const body = await signedBody('notes-import-kickoff', {
      notesText: NOTES_TEXT,
      context: NOTES_CONTEXT,
    })

    const response = await handleNotesImportKickoffRequest(context(env, { body }))

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({ refinement: false })
    expect(decodeBodies).toEqual([{ integrityToken: 'token.abc' }])
    // Credits and Supporter status key on the account id, exactly as on iOS.
    expect(indexNames).toContain(ACCOUNT_ID)
    expect(index.checkCredit).toHaveBeenCalledTimes(1)
    expect(appAttestIdentity.get).not.toHaveBeenCalled()
  })

  it('reports a started Android import to analytics without its identity', async () => {
    const { env, signedBody } = await setup()
    const tracked = { ...env, POSTHOG_PROJECT_TOKEN: 'phc_test' } as Environment
    const body = await signedBody('notes-import-kickoff', {
      notesText: NOTES_TEXT,
      context: NOTES_CONTEXT,
    })

    const response = await handleNotesImportKickoffRequest(
      context(tracked, { body })
    )

    expect(response.status).toBe(200)
    expect(analytics.capture).toHaveBeenCalledOnce()
    const [, event] = analytics.capture.mock.calls[0] as unknown as [
      Environment,
      { event: string; distinctId: string; properties: object },
    ]
    expect(event).toEqual({
      event: 'api_notes_import_started',
      distinctId: expect.stringMatching(/^ww_[0-9a-f]{32}$/),
      properties: {
        platform: 'android',
        transport: 'stream',
        refinement: false,
        supporter: false,
        has_account: true,
        notes_chars: NOTES_TEXT.length,
        new_content: true,
        imports_remaining: 4,
      },
    })
    expect(JSON.stringify(event)).not.toContain(ACCOUNT_ID)
    expect(JSON.stringify(event)).not.toContain(UUID)
  })

  it('reports an exhausted allowance to analytics', async () => {
    const { env, index, signedBody } = await setup()
    index.checkCredit.mockResolvedValueOnce({
      decision: {
        allowed: false,
        reason: 'limit_reached',
        isNewHash: true,
        isRefinement: false,
        remaining: 0,
      },
      credits: { ...(await index.kickoffCredits()), remaining: 0 },
    } as never)
    const tracked = { ...env, POSTHOG_PROJECT_TOKEN: 'phc_test' } as Environment
    const body = await signedBody('notes-import-kickoff', {
      notesText: NOTES_TEXT,
      context: NOTES_CONTEXT,
    })

    const response = await handleNotesImportKickoffRequest(
      context(tracked, { body })
    )

    expect(response.status).toBe(402)
    expect(analytics.capture).toHaveBeenCalledOnce()
    expect(analytics.capture.mock.calls[0]).toMatchObject([
      tracked,
      {
        event: 'api_notes_import_limit_reached',
        properties: { platform: 'android', limit: 'imports' },
      },
    ])
  })

  it('sends no analytics without a PostHog token', async () => {
    const { env, signedBody } = await setup()
    const body = await signedBody('notes-import-kickoff', {
      notesText: NOTES_TEXT,
      context: NOTES_CONTEXT,
    })
    await handleNotesImportKickoffRequest(context(env, { body }))
    expect(analytics.capture).not.toHaveBeenCalled()
  })

  it('refuses a replayed kickoff token', async () => {
    const { env, signedBody } = await setup()
    const body = await signedBody('notes-import-kickoff', {
      notesText: NOTES_TEXT,
      context: NOTES_CONTEXT,
    })
    await handleNotesImportKickoffRequest(context(env, { body }))

    const replay = await handleNotesImportKickoffRequest(context(env, { body }))
    expect(replay.status).toBe(401)
    await expect(replay.json()).resolves.toMatchObject({
      code: 'attestation_failed',
      reason: 'challenge_not_found',
      action: 'start_new_operation',
    })
  })

  it('rejects a payload the token does not cover before spending a challenge', async () => {
    const { env, index, signedBody, decodeBodies } = await setup()
    const body = await signedBody('notes-import-kickoff', {
      notesText: NOTES_TEXT,
      context: { ...NOTES_CONTEXT, locale: 'fr-FR' },
    })

    const response = await handleNotesImportKickoffRequest(context(env, { body }))

    expect(response.status).toBe(400)
    expect(decodeBodies).toEqual([])
    expect(index.checkCredit).not.toHaveBeenCalled()
  })

  it('returns a stable reason for a device that fails integrity', async () => {
    const { env, index, signedBody } = await setup({ device: [] })
    const body = await signedBody('notes-import-kickoff', {
      notesText: NOTES_TEXT,
      context: NOTES_CONTEXT,
    })

    const response = await handleNotesImportKickoffRequest(context(env, { body }))

    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toMatchObject({
      code: 'attestation_failed',
      reason: 'device_integrity_failed',
      action: 'none',
    })
    expect(index.checkCredit).not.toHaveBeenCalled()
  })

  it('requires the integrity token itself', async () => {
    const { env, signedBody } = await setup()
    const { integrityToken: _token, ...body } = await signedBody(
      'notes-import-kickoff',
      { notesText: NOTES_TEXT, context: NOTES_CONTEXT }
    )
    const response = await handleNotesImportKickoffRequest(context(env, { body }))
    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({
      reason: 'invalid_request',
    })
  })

  it('keeps Play Integrity off the legacy synchronous endpoint and the attest route', async () => {
    const { env, signedBody } = await setup()
    const body = await signedBody('notes-import-kickoff', {
      notesText: NOTES_TEXT,
      context: NOTES_CONTEXT,
    })
    for (const handler of [handleNotesImportRequest, handleAttestationRegisterRequest]) {
      const response = await handler(context(env, { body }))
      expect(response.status).toBe(400)
      await expect(response.json()).resolves.toMatchObject({
        reason: 'unsupported_protocol',
      })
    }
  })

  it('proves the full path through the verify probe without touching credits', async () => {
    const { env, index, signedBody } = await setup()
    const body = await signedBody('notes-import-verify', {})

    const response = await handleAttestationVerifyRequest(context(env, { body }))

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      ok: true,
      attestationProvider: 'play-integrity',
      protocolVersion: 1,
      operationId: 'play-operation-1',
    })
    expect(index.checkCredit).not.toHaveBeenCalled()
  })

  it('returns integrity_unavailable while the worker is not configured', async () => {
    const { env } = await setup()
    const unconfigured = {
      ...env,
      PLAY_INTEGRITY_SERVICE_ACCOUNT_JSON: undefined,
    } as Environment
    const response = await handleAttestationChallengeRequest(
      context(unconfigured, { body: challengeFields('notes-import-kickoff') })
    )
    expect(response.status).toBe(503)
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      code: 'server_error',
      reason: 'integrity_unavailable',
      action: 'retry',
      retryAfter: 30,
    })
  })

  it('advertises the capability only when fully configured', async () => {
    const { env } = await setup()
    const status = (environment: Environment) =>
      getNotesImportStatus({
        kv: env.NOTES_KV as unknown as StatusKv,
        env: environment,
        apiKey: 'k',
        config: {} as never,
        includeLimits: false,
      })

    await expect(status(env)).resolves.toMatchObject({
      capabilities: {
        appAttest: { protocolVersions: [1, 2] },
        playIntegrity: {
          protocolVersions: [1],
          cloudProjectNumber: '123456789012',
        },
      },
    })
    const partial = await status({
      ...env,
      PLAY_INTEGRITY_CLOUD_PROJECT_NUMBER: undefined,
    } as Environment)
    expect(partial.capabilities).toEqual({
      appAttest: { protocolVersions: [1, 2] },
      transcribe: { maxPages: 10, maxBytes: 4 * 1024 * 1024 },
    })
  })
})
