import { afterEach, describe, expect, it, vi } from 'vitest'
import { makeMemoryKv } from '../test/memoryKv'
import { sha256Hex } from '../crypto'
import { computeNotesImportTranscribeRequestHash } from '../appAttest/protocol'
import type { AppContext, Environment } from '../types'
import { base64DecodedBytes, matchesImageMagic } from './transcribe'

const transcribeNotesPage = vi.hoisted(() => vi.fn())
vi.mock('./transcribe', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./transcribe')>()),
  transcribeNotesPage,
}))

const { handleNotesImportTranscribeRequest } = await import('./route')

const UUID = '65A8B00C-DA7A-4E0A-BA5C-8E3D1B8C5F1C'
/** The first bytes of a JPEG (FF D8 FF E0 00 10). */
const JPEG = '/9j/4AAQ'
/** Pinned so the app's request hash can't drift from the server's. */
const GOLDEN_IMAGE_HASH =
  '6e7eb94d97c303b438c9c78f339ba53ab979dcbc288e2b1d4068e871588c5f40'
const GOLDEN_REQUEST_HASH =
  '0cf27737695fe2c115efcdc525293fae76c46c6424c9a53c452b4b9b073db34d'

const context = (
  environment: Environment,
  body: unknown,
  headers: Record<string, string> = {}
): AppContext =>
  ({
    env: {
      APP_ATTEST_ENVIRONMENT: environment.NOTES_IMPORT_DEV_BYPASS_TOKEN
        ? 'development'
        : 'production',
      ...environment,
    },
    req: {
      json: async () => body,
      header: (name: string) => headers[name.toLowerCase()],
    },
    json: (payload: unknown, status = 200) =>
      Response.json(payload, { status }),
  }) as unknown as AppContext

const makeEnvironment = async (
  options: { devBypassToken?: string; allowed?: boolean; pageOk?: boolean } = {}
) => {
  const kv = makeMemoryKv()
  await kv.put('notes-import:provider-health', 'up')
  const verifyAssertion = vi.fn(async () => ({
    ok: true as const,
    value: { ok: true as const, protocolVersion: 2 as const },
  }))
  const credits = {
    remaining: options.allowed === false ? 0 : 2,
    limit: 3,
    resetsAt: null,
    isSupporter: false,
    refinements: { remaining: 5, limit: 5 },
  }
  const index = {
    checkCredit: vi.fn(async () => ({
      decision:
        options.allowed === false
          ? { allowed: false, reason: 'limit_reached' }
          : { allowed: true, isNewHash: true, isRefinement: false, remaining: 2 },
      credits,
    })),
    takeTranscribePage: vi.fn(async () =>
      options.pageOk === false
        ? { ok: false as const, retryAfterMs: 90_500 }
        : { ok: true as const, remaining: 39 }
    ),
  }
  const environment = {
    NOTES_KV: kv,
    OPENROUTER_API_KEY: 'openrouter-test',
    REVENUECAT_API_KEY: 'revenuecat-test',
    NOTES_IMPORT_DEV_BYPASS_TOKEN: options.devBypassToken,
    APP_ATTEST_IDENTITY: {
      idFromName: () => ({ toString: () => 'identity-id' }),
      get: () => ({ verifyAssertion }),
    },
    NOTES_IMPORT_INDEX: {
      idFromName: () => ({ toString: () => 'index-id' }),
      get: () => index,
    },
  } as unknown as Environment
  return { environment, verifyAssertion, index }
}

const payload = async (image = JPEG, mimeType = 'image/jpeg') => {
  const contentHash = await sha256Hex(image)
  return {
    uuid: UUID,
    image,
    mimeType,
    contentHash,
    requestHash: await computeNotesImportTranscribeRequestHash({
      imageHash: contentHash,
      mimeType,
    }),
  }
}

describe('page image validation', () => {
  it('measures decoded base64 without decoding it', () => {
    expect(base64DecodedBytes('/9j/4AAQ')).toBe(6)
    expect(base64DecodedBytes('/9j/4A==')).toBe(4)
    expect(base64DecodedBytes('not base64!')).toBeNull()
    expect(base64DecodedBytes('abc')).toBeNull()
    expect(base64DecodedBytes('')).toBeNull()
  })

  it('checks the declared type against the leading bytes', () => {
    expect(matchesImageMagic(JPEG, 'image/jpeg')).toBe(true)
    expect(matchesImageMagic(JPEG, 'image/png')).toBe(false)
    expect(matchesImageMagic('iVBORw0KGgo=', 'image/png')).toBe(true)
  })

  it('pins the request hash the app signs', async () => {
    expect(await sha256Hex(JPEG)).toBe(GOLDEN_IMAGE_HASH)
    expect(
      await computeNotesImportTranscribeRequestHash({
        imageHash: GOLDEN_IMAGE_HASH,
        mimeType: 'image/jpeg',
      })
    ).toBe(GOLDEN_REQUEST_HASH)
  })
})

describe('POST /notes-import/transcribe', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    transcribeNotesPage.mockReset()
  })

  const notSupporter = () =>
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(null, { status: 404 }))
    )

  it('returns the page text with the dev bypass', async () => {
    notSupporter()
    const { environment, index } = await makeEnvironment({
      devBypassToken: 'dev-token',
    })
    transcribeNotesPage.mockResolvedValue({
      text: 'Ana Silva | 12 Oak St | RV Tue',
      usage: { inputTokens: 900, outputTokens: 20 },
      finishReason: 'stop',
    })

    const response = await handleNotesImportTranscribeRequest(
      context(environment, await payload(), { 'x-ww-dev-bypass': 'dev-token' })
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      ok: true,
      text: 'Ana Silva | 12 Oak St | RV Tue',
      truncated: false,
      pagesRemaining: 39,
    })
    expect(index.takeTranscribePage).toHaveBeenCalledWith(
      200,
      24 * 60 * 60 * 1000
    )
    expect(transcribeNotesPage).toHaveBeenCalledWith(
      expect.objectContaining({ image: JPEG, mimeType: 'image/jpeg' })
    )
  })

  it('verifies a v2 App Attest assertion for the transcribe purpose', async () => {
    notSupporter()
    const { environment, verifyAssertion, index } = await makeEnvironment()
    transcribeNotesPage.mockResolvedValue({
      text: 'Met Ana',
      usage: {},
      finishReason: 'length',
    })
    const body = {
      ...(await payload()),
      protocolVersion: 2,
      operation: 'assert',
      operationId: 'assert-operation-1',
      purpose: 'notes-import-transcribe',
      keyId: `${'A'.repeat(43)}=`,
      challenge: 'C'.repeat(43),
      assertion: 'assertion',
    }

    const response = await handleNotesImportTranscribeRequest(
      context(environment, body)
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({ truncated: true })
    expect(verifyAssertion).toHaveBeenCalledWith(
      expect.objectContaining({
        purpose: 'notes-import-transcribe',
        contentHash: body.contentHash,
        requestHash: body.requestHash,
      })
    )
    expect(index.takeTranscribePage).toHaveBeenCalledWith(40, expect.any(Number))
  })

  it('refuses an assertion signed for another purpose', async () => {
    const { environment, verifyAssertion } = await makeEnvironment()
    const response = await handleNotesImportTranscribeRequest(
      context(environment, {
        ...(await payload()),
        protocolVersion: 2,
        operation: 'assert',
        operationId: 'assert-operation-1',
        purpose: 'notes-import-kickoff',
        keyId: `${'A'.repeat(43)}=`,
        challenge: 'C'.repeat(43),
        assertion: 'assertion',
      })
    )
    expect(response.status).toBe(400)
    expect(verifyAssertion).not.toHaveBeenCalled()
    expect(transcribeNotesPage).not.toHaveBeenCalled()
  })

  it('refuses v1 App Attest', async () => {
    const { environment } = await makeEnvironment()
    const response = await handleNotesImportTranscribeRequest(
      context(environment, {
        ...(await payload()),
        keyId: 'key',
        challenge: 'challenge',
        assertion: 'assertion',
      })
    )
    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({
      reason: 'unsupported_protocol',
    })
  })

  it('rejects a payload its hashes do not cover', async () => {
    const { environment } = await makeEnvironment({ devBypassToken: 'dev' })
    const body = { ...(await payload()), mimeType: 'image/png' }
    const response = await handleNotesImportTranscribeRequest(
      context(environment, body, { 'x-ww-dev-bypass': 'dev' })
    )
    expect(response.status).toBe(400)
    expect(transcribeNotesPage).not.toHaveBeenCalled()
  })

  it('rejects an image that is not the declared type', async () => {
    const { environment } = await makeEnvironment({ devBypassToken: 'dev' })
    const response = await handleNotesImportTranscribeRequest(
      context(environment, await payload('AAAAAAAA'), {
        'x-ww-dev-bypass': 'dev',
      })
    )
    expect(response.status).toBe(400)
  })

  it('rejects an oversized image before hashing it', async () => {
    const { environment } = await makeEnvironment({ devBypassToken: 'dev' })
    environment.NOTES_IMPORT_TRANSCRIBE_MAX_BYTES = '4'
    const response = await handleNotesImportTranscribeRequest(
      context(environment, await payload(), { 'x-ww-dev-bypass': 'dev' })
    )
    expect(response.status).toBe(413)
    await expect(response.json()).resolves.toMatchObject({ code: 'too_large' })
  })

  it('refuses a free user with no imports left before reading a page', async () => {
    notSupporter()
    const { environment, index } = await makeEnvironment({
      devBypassToken: 'dev',
      allowed: false,
    })
    const response = await handleNotesImportTranscribeRequest(
      context(environment, await payload(), { 'x-ww-dev-bypass': 'dev' })
    )
    expect(response.status).toBe(402)
    await expect(response.json()).resolves.toMatchObject({
      code: 'limit_reached',
    })
    expect(index.takeTranscribePage).not.toHaveBeenCalled()
  })

  it('says when the daily page limit frees up', async () => {
    notSupporter()
    const { environment } = await makeEnvironment({
      devBypassToken: 'dev',
      pageOk: false,
    })
    const response = await handleNotesImportTranscribeRequest(
      context(environment, await payload(), { 'x-ww-dev-bypass': 'dev' })
    )
    expect(response.status).toBe(429)
    await expect(response.json()).resolves.toMatchObject({
      code: 'transcribe_limit',
      retryAfter: 91,
    })
    expect(transcribeNotesPage).not.toHaveBeenCalled()
  })

  it('maps a model failure to model_error', async () => {
    notSupporter()
    const { environment } = await makeEnvironment({ devBypassToken: 'dev' })
    transcribeNotesPage.mockRejectedValue(new Error('provider down'))
    const response = await handleNotesImportTranscribeRequest(
      context(environment, await payload(), { 'x-ww-dev-bypass': 'dev' })
    )
    expect(response.status).toBe(502)
    await expect(response.json()).resolves.toMatchObject({
      code: 'model_error',
    })
  })
})
