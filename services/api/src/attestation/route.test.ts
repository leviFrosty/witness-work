import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('cloudflare:workers', () => ({ DurableObject: class {} }))

import { app } from '../app'
import { makeMemoryKv } from '../test/memoryKv'
import type { Environment } from '../types'
import { ATTESTATION_PURPOSES, isAttestationPurpose } from './purposes'
import { requireAttestation } from './http'
import type { AppContext } from '../types'

const ORIGIN = 'https://ww-proxy.leviwilkerson.com'
const UUID = '65A8B00C-DA7A-4E0A-BA5C-8E3D1B8C5F1C'
const HASH = 'a'.repeat(64)

const v2VerifyBody = (purpose: string) => ({
  protocolVersion: 2,
  operation: 'assert',
  operationId: 'verify-operation-1',
  purpose,
  uuid: UUID,
  keyId: `${'A'.repeat(43)}=`,
  challenge: 'C'.repeat(43),
  assertion: 'assertion',
  contentHash: HASH,
  requestHash: HASH,
})

const makeEnv = (overrides: Partial<Record<string, unknown>> = {}) => {
  const verifyAssertion = vi.fn(async () => ({
    ok: true as const,
    value: {
      ok: true as const,
      protocolVersion: 2 as const,
      operationId: 'verify-operation-1',
    },
  }))
  const limit = vi.fn(async (_: { key: string }) => ({ success: true }))
  const env = {
    APP_ATTEST_ENVIRONMENT: 'production',
    NOTES_KV: makeMemoryKv(),
    RATE_LIMITER: { limit },
    APP_ATTEST_IDENTITY: {
      idFromName: () => ({ toString: () => 'identity-id' }),
      get: () => ({ verifyAssertion }),
    },
    ...overrides,
  } as unknown as Environment
  return { env, verifyAssertion, limit }
}

const call = (
  env: Environment,
  method: string,
  path: string,
  body?: unknown,
  headers: Record<string, string> = {}
) =>
  app.fetch(
    new Request(`${ORIGIN}${path}`, {
      method,
      headers: { 'content-type': 'application/json', ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
    env
  )

afterEach(() => {
  vi.restoreAllMocks()
})

describe('/attestation/v1', () => {
  it('issues a challenge with no deprecation headers', async () => {
    const { env } = makeEnv()
    const response = await call(env, 'POST', '/attestation/v1/challenge')
    expect(response.status).toBe(200)
    const body = (await response.json()) as { challenge: string }
    expect(body.challenge).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(response.headers.get('Deprecation')).toBeNull()
  })

  it('counts in its own rate-limit family', async () => {
    const { env, limit } = makeEnv()
    await call(env, 'POST', '/attestation/v1/challenge', undefined, {
      'cf-connecting-ip': '198.18.0.1',
    })
    expect(limit).toHaveBeenCalledWith({ key: 'attestation:198.18.0.1' })
  })

  it('refuses a Play Integrity body on register', async () => {
    const { env } = makeEnv()
    const response = await call(env, 'POST', '/attestation/v1/register', {
      attestationProvider: 'play-integrity',
    })
    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({
      code: 'bad_request',
      reason: 'unsupported_protocol',
    })
  })

  it.each(['attestation-verify', 'notes-import-verify'])(
    'verifies a v2 assertion signed for %s',
    async (purpose) => {
      const { env, verifyAssertion } = makeEnv()
      const body = v2VerifyBody(purpose)
      const response = await call(env, 'POST', '/attestation/v1/verify', body)
      expect(response.status).toBe(200)
      expect(verifyAssertion).toHaveBeenCalledWith(body)
    }
  )

  it('refuses an assertion signed for another route', async () => {
    const { env, verifyAssertion } = makeEnv()
    const response = await call(
      env,
      'POST',
      '/attestation/v1/verify',
      v2VerifyBody('notes-import-kickoff')
    )
    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({
      code: 'bad_request',
      reason: 'invalid_request',
    })
    expect(verifyAssertion).not.toHaveBeenCalled()
  })

  it('accepts the dev bypass with the new purpose', async () => {
    const { env } = makeEnv({
      APP_ATTEST_ENVIRONMENT: 'development',
      NOTES_IMPORT_DEV_BYPASS_TOKEN: 'bypass-token',
    })
    const { keyId: _k, challenge: _c, assertion: _a, ...body } =
      v2VerifyBody('attestation-verify')
    const response = await call(env, 'POST', '/attestation/v1/verify', body, {
      'x-ww-dev-bypass': 'bypass-token',
    })
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      ok: true,
      protocolVersion: 2,
      operationId: body.operationId,
    })
  })

  it('reports the accepted providers', async () => {
    const { env } = makeEnv()
    const response = await call(env, 'GET', '/attestation/v1/status')
    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    await expect(response.json()).resolves.toEqual({
      ok: true,
      capabilities: { appAttest: { protocolVersions: [1, 2] } },
      providers: { appAttest: { protocolVersions: [1, 2] } },
    })
  })
})

/**
 * An env with Scribe AI's legacy switch on: the old paths are under
 * `/notes-import/`, which answers 426 otherwise (src/scribe/legacy.ts).
 */
const legacyEnv = (...args: Parameters<typeof makeEnv>) => {
  const made = makeEnv(...args)
  ;(made.env.NOTES_KV as unknown as ReturnType<typeof makeMemoryKv>).store.set(
    'scribe:legacy-notes-import',
    'on'
  )
  return made
}

describe('the old /notes-import attestation paths', () => {
  it.each([
    ['/notes-import/challenge', '/attestation/v1/challenge', undefined],
    ['/notes-import/attest', '/attestation/v1/register', {}],
    ['/notes-import/verify', '/attestation/v1/verify', {}],
  ])(
    '%s answers like %s, with Deprecation and a successor link',
    async (path, successor, body) => {
      const { env } = legacyEnv()
      vi.spyOn(console, 'log').mockImplementation(() => {})
      const [old, current] = await Promise.all([
        call(env, 'POST', path, body),
        call(env, 'POST', successor, body),
      ])
      expect(old.status).toBe(current.status)
      if (old.status !== 200) {
        expect(await old.json()).toEqual(await current.json())
      }
      expect(old.headers.get('Deprecation')).toBe('@1792022400')
      expect(old.headers.get('Link')).toBe(
        `<${successor}>; rel="successor-version"`
      )
      expect(console.log).toHaveBeenCalledWith(
        `deprecated path: ${path} -> ${successor}`
      )
    }
  )

  it('still counts in the Notes Import rate-limit family', async () => {
    const { env, limit } = legacyEnv()
    vi.spyOn(console, 'log').mockImplementation(() => {})
    await call(env, 'POST', '/notes-import/challenge', undefined, {
      'cf-connecting-ip': '198.18.0.1',
    })
    expect(limit).toHaveBeenCalledWith({ key: 'notes-import:198.18.0.1' })
  })

  it('keeps accepting the old verify purpose', async () => {
    const { env, verifyAssertion } = legacyEnv()
    vi.spyOn(console, 'log').mockImplementation(() => {})
    const response = await call(
      env,
      'POST',
      '/notes-import/verify',
      v2VerifyBody('notes-import-verify')
    )
    expect(response.status).toBe(200)
    expect(verifyAssertion).toHaveBeenCalledOnce()
  })
})

describe('attestation purposes', () => {
  it('keeps every shipped purpose', () => {
    // Installed apps sign these; renaming one breaks them.
    for (const purpose of [
      'notes-import-kickoff',
      'notes-import-verify',
      'notes-import-transcribe',
      'attestation-verify',
    ]) {
      expect(isAttestationPurpose(purpose)).toBe(true)
    }
    expect(isAttestationPurpose('notes-import')).toBe(false)
  })

  it('fit the signed-field alphabet', () => {
    for (const purpose of ATTESTATION_PURPOSES) {
      expect(purpose).toMatch(/^[a-z0-9-]{1,64}$/)
    }
  })
})

describe('requireAttestation', () => {
  const context = (env: Environment) =>
    ({
      env,
      json: (body: unknown, status = 200) => Response.json(body, { status }),
    }) as unknown as AppContext

  it('passes an App Attest v2 assertion signed for the purpose', async () => {
    const { env, verifyAssertion } = makeEnv()
    const record = v2VerifyBody('attestation-verify')
    await expect(
      requireAttestation(context(env), record, 'attestation-verify')
    ).resolves.toBeNull()
    expect(verifyAssertion).toHaveBeenCalledWith(record)
  })

  it('refuses App Attest v1 and other purposes as unsupported', async () => {
    const { env, verifyAssertion } = makeEnv()
    for (const record of [
      { keyId: 'k', challenge: 'c', assertion: 'a' },
      v2VerifyBody('notes-import-kickoff'),
    ]) {
      const response = await requireAttestation(
        context(env),
        record,
        'attestation-verify'
      )
      expect(response?.status).toBe(400)
      await expect(response?.json()).resolves.toMatchObject({
        reason: 'unsupported_protocol',
      })
    }
    expect(verifyAssertion).not.toHaveBeenCalled()
  })
})
