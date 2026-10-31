import { ed25519 } from '@noble/curves/ed25519.js'
import { describe, expect, it, type Mock, vi } from 'vitest'
import { concatBytes, fromB64u, fromUtf8, toB64u, utf8 } from '@/lib/bytes'
import { HttpError } from '@/lib/http/request'
import type { AccountAuthorize } from '@/lib/serverAccount/client'
import { deriveAccountSigningKey } from '@/lib/serverAccount/keys'
import {
  addPasskey,
  finishPasskeySignIn,
  finishPasskeyStepUp,
  listPasskeys,
  passkeyFailureFor,
  passkeyRegistrationOptions,
  removePasskey,
  savePasskeyWrap,
  startPasskeySignIn,
  startPasskeyStepUp,
  webRecovery,
  webSignup,
  webSignupOptions,
} from '@/lib/serverAccount/passkeyClient'
import { AccountSessionError } from '@/lib/serverAccount/session'

vi.mock('@/lib/logger', () => import('@/__tests__/mocks/logger'))
vi.mock('@/lib/http/online', () => ({ isKnownOffline: () => false }))

const key = deriveAccountSigningKey(new Uint8Array(32).fill(3))
const ACCOUNT = 'A'.repeat(22)
const PRF = toB64u(new Uint8Array(32).fill(9))

type Seen = {
  url: string
  method: string
  headers: Record<string, string>
  body: Record<string, unknown> | null
}

function fakeFetch(respond: (seen: Seen, index: number) => Response) {
  const seen: Seen[] = []
  const fetchImpl = vi.fn(async (url: string, init: RequestInit) => {
    const entry = {
      url,
      method: init.method ?? 'GET',
      headers: init.headers as Record<string, string>,
      body:
        typeof init.body === 'string'
          ? (JSON.parse(init.body) as Record<string, unknown>)
          : null,
    }
    seen.push(entry)
    return respond(entry, seen.length - 1)
  }) as unknown as typeof fetch
  const authorize = vi.fn(<T>(run: (authorization: string) => Promise<T>) =>
    run('Bearer access')
  ) as AccountAuthorize & Mock
  const sign = {
    baseUrl: 'https://api.test',
    key,
    now: () => 1_000_000,
    randomBytes: (length: number) => new Uint8Array(length).fill(1),
    fetchImpl,
  }
  const plain = { baseUrl: 'https://api.test', fetchImpl }
  const bearer = { baseUrl: 'https://api.test', authorize, fetchImpl }
  return { seen, plain, bearer, both: { ...bearer, sign }, sign, authorize }
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })

function verified(op: string, body: Record<string, unknown> | null) {
  const payload = fromB64u(body!.payload as string)
  expect(
    ed25519.verify(
      fromB64u(body!.signature as string),
      concatBytes(utf8(`ww-account/v1\n${op}\n`), payload),
      fromB64u(key.publicKey)
    )
  ).toBe(true)
  return JSON.parse(fromUtf8(payload)) as Record<string, unknown>
}

/** A response with a PRF output the server must never see. */
const assertion = () => ({
  id: 'cred',
  rawId: 'cred',
  type: 'public-key' as const,
  response: { clientDataJSON: 'cd', authenticatorData: 'ad', signature: 's' },
  clientExtensionResults: { prf: { results: { first: PRF } } },
})

const OPTIONS = { challenge: 'Y2hhbGxlbmdl', rpId: 'app.witnesswork.app' }

describe('signing in with a passkey', () => {
  it('asks for a sign-in challenge without auth', async () => {
    const { seen, plain } = fakeFetch(() =>
      json(200, { ok: true, challengeToken: 'ct', options: OPTIONS })
    )
    expect(await startPasskeySignIn({}, plain)).toEqual({
      challengeToken: 'ct',
      options: OPTIONS,
    })
    expect(seen[0].url).toBe('https://api.test/accounts/v1/passkeys/challenge')
    expect(seen[0].method).toBe('POST')
    expect(seen[0].body).toEqual({ purpose: 'sign-in' })
    expect(seen[0].headers.authorization).toBeUndefined()
    await startPasskeySignIn({ rpId: 'localhost' }, plain)
    expect(seen[1].body).toEqual({ purpose: 'sign-in', rpId: 'localhost' })
  })

  it('refuses options without a challenge', async () => {
    const { plain } = fakeFetch(() =>
      json(200, { ok: true, challengeToken: 'ct', options: {} })
    )
    await expect(startPasskeySignIn({}, plain)).rejects.toMatchObject({
      serverCode: 'unexpected_response',
    })
  })

  it('posts the assertion without its PRF output and reads the wraps', async () => {
    const answer = {
      ok: true,
      accountId: ACCOUNT,
      accountPub: key.publicKey,
      status: 'active',
      keyEpoch: 0,
      credentialId: 'cred',
      userHandle: 'handle',
      wraps: [{ wrapId: 'w1', wrap: 'x'.repeat(98), keyEpoch: 0 }],
      ticket: 'ticket',
      ticketExpiresAt: 2_000,
    }
    const { seen, plain } = fakeFetch(() => json(200, answer))
    const result = await finishPasskeySignIn(
      { challengeToken: 'ct', response: assertion() },
      plain
    )
    const { ok: _, ...rest } = answer
    expect(result).toEqual(rest)
    expect(seen[0].url).toBe('https://api.test/accounts/v1/passkeys/assert')
    expect(JSON.stringify(seen[0].body)).not.toContain(PRF)
    expect(seen[0].body).toMatchObject({
      challengeToken: 'ct',
      response: { id: 'cred', clientExtensionResults: {} },
    })
  })

  it('reads a phone sign-in without a ticket', async () => {
    const { plain } = fakeFetch(() =>
      json(200, {
        ok: true,
        accountId: ACCOUNT,
        accountPub: key.publicKey,
        status: 'suspended',
        keyEpoch: 2,
        credentialId: 'cred',
        userHandle: 'handle',
        wraps: [],
      })
    )
    const result = await finishPasskeySignIn(
      { challengeToken: 'ct', response: assertion() },
      plain
    )
    expect(result.ticket).toBeUndefined()
    expect(result.status).toBe('suspended')
    expect(result.wraps).toEqual([])
  })

  it('refuses a malformed answer', async () => {
    const { plain } = fakeFetch(() =>
      json(200, { ok: true, accountId: 'short', wraps: [] })
    )
    await expect(
      finishPasskeySignIn(
        { challengeToken: 'ct', response: assertion() },
        plain
      )
    ).rejects.toMatchObject({ serverCode: 'unexpected_response' })
  })
})

describe('step-up', () => {
  it('sends the RP ID when given', async () => {
    const { seen, bearer } = fakeFetch(() =>
      json(200, { ok: true, challengeToken: 'ct', options: OPTIONS })
    )
    await startPasskeyStepUp({ rpId: 'localhost' }, bearer)
    expect(seen[0].body).toEqual({ purpose: 'step-up', rpId: 'localhost' })
  })

  it('asks for and answers a challenge with the session', async () => {
    const { seen, bearer, authorize } = fakeFetch((_, index) =>
      index === 0
        ? json(200, { ok: true, challengeToken: 'ct', options: OPTIONS })
        : json(200, { ok: true, credentialId: 'cred', stepUpAt: 5 })
    )
    expect(await startPasskeyStepUp({}, bearer)).toEqual({
      challengeToken: 'ct',
      options: OPTIONS,
    })
    expect(
      await finishPasskeyStepUp(
        { challengeToken: 'ct', response: assertion() },
        bearer
      )
    ).toEqual({ credentialId: 'cred', stepUpAt: 5 })
    expect(authorize).toHaveBeenCalledTimes(2)
    expect(seen[0].body).toEqual({ purpose: 'step-up' })
    expect(seen[0].headers.authorization).toBe('Bearer access')
    expect(seen[1].url).toBe('https://api.test/accounts/v1/passkeys/assert')
    expect(seen[1].headers.authorization).toBe('Bearer access')
    expect(JSON.stringify(seen[1].body)).not.toContain(PRF)
  })
})

describe('adding a passkey', () => {
  it('asks for creation options with the session', async () => {
    const { seen, bearer } = fakeFetch(() =>
      json(200, {
        ok: true,
        challengeToken: 'ct',
        options: { ...OPTIONS, user: { id: 'handle' } },
        userHandle: 'handle',
      })
    )
    const result = await passkeyRegistrationOptions({}, bearer)
    expect(result.userHandle).toBe('handle')
    expect(seen[0].url).toBe(
      'https://api.test/accounts/v1/passkeys/register/options'
    )
    expect(seen[0].body).toEqual({})
    expect(seen[0].headers.authorization).toBe('Bearer access')
  })

  it('posts the registration signed and with the session', async () => {
    const { seen, both } = fakeFetch(() =>
      json(200, { ok: true, credentialId: 'cred' })
    )
    expect(
      await addPasskey(
        { challengeToken: 'ct', response: assertion(), label: 'sealed' },
        both
      )
    ).toEqual({ credentialId: 'cred' })
    expect(seen[0].url).toBe('https://api.test/accounts/v1/passkeys')
    expect(seen[0].headers.authorization).toBe('Bearer access')
    const payload = verified('passkey/add', seen[0].body)
    expect(payload).toMatchObject({
      accountPub: key.publicKey,
      ts: 1_000_000,
      challengeToken: 'ct',
      label: 'sealed',
    })
    expect(payload).not.toHaveProperty('wrap')
    expect(JSON.stringify(payload)).not.toContain(PRF)
  })

  it('sends a wrap with its id and key epoch', async () => {
    const { seen, both } = fakeFetch(() =>
      json(200, { ok: true, credentialId: 'cred' })
    )
    await addPasskey(
      {
        challengeToken: 'ct',
        response: assertion(),
        wrap: { wrapId: 'w', keyEpoch: 2, wrap: 'x' },
      },
      both
    )
    expect(verified('passkey/add', seen[0].body)).toMatchObject({
      wrapId: 'w',
      keyEpoch: 2,
      wrap: 'x',
    })
  })

  it('takes a wrap only with its id and key epoch', () => {
    const { both } = fakeFetch(() => json(200, { ok: true }))
    const args = { challengeToken: 'ct', response: assertion() }
    const never = () => {
      // @ts-expect-error A wrap without its id and key epoch.
      void addPasskey({ ...args, wrap: { wrap: 'x' } }, both)
      // @ts-expect-error Its parts loose, as before.
      void addPasskey({ ...args, wrapId: 'w', wrap: 'x' }, both)
    }
    expect(never).toBeTypeOf('function')
  })

  it('saves a wrap signed and with the session', async () => {
    const { seen, both } = fakeFetch(() => json(200, { ok: true }))
    await savePasskeyWrap(
      { credentialId: 'cred', wrapId: 'w', keyEpoch: 0, wrap: 'x' },
      both
    )
    expect(seen[0].url).toBe('https://api.test/accounts/v1/passkeys/wrap')
    expect(seen[0].headers.authorization).toBe('Bearer access')
    expect(verified('passkey/wrap', seen[0].body)).toMatchObject({
      credentialId: 'cred',
      wrapId: 'w',
      keyEpoch: 0,
      wrap: 'x',
    })
  })
})

describe('retrying a lost answer', () => {
  // A 503 with `retry-after: 0` retries at once.
  const flaky = () =>
    fakeFetch((_, index) =>
      index === 0
        ? new Response(JSON.stringify({ ok: false, error: 'internal' }), {
            status: 503,
            headers: { 'content-type': 'application/json', 'retry-after': '0' },
          })
        : json(200, { ok: true, passkeys: [] })
    )

  it('saves a wrap again', async () => {
    const { seen, both } = flaky()
    await savePasskeyWrap(
      { credentialId: 'cred', wrapId: 'w', keyEpoch: 0, wrap: 'x' },
      both
    )
    expect(seen).toHaveLength(2)
  })

  it('removes a passkey again', async () => {
    const { seen, both } = flaky()
    await removePasskey('cred', both)
    expect(seen).toHaveLength(2)
  })

  it('lists the passkeys again', async () => {
    const { seen, bearer } = flaky()
    expect(await listPasskeys(bearer)).toEqual({ passkeys: [] })
    expect(seen).toHaveLength(2)
  })

  it('never adds a passkey twice', async () => {
    const { seen, both } = flaky()
    await expect(
      addPasskey({ challengeToken: 'ct', response: assertion() }, both)
    ).rejects.toBeInstanceOf(HttpError)
    expect(seen).toHaveLength(1)
  })
})

describe('listing and removing passkeys', () => {
  it('lists the account passkeys', async () => {
    const { seen, bearer } = fakeFetch(() =>
      json(200, {
        ok: true,
        userHandle: 'handle',
        passkeys: [
          {
            credentialId: 'a',
            canUnlock: true,
            createdAt: 1,
            lastUsedAt: 2,
            createdPlatform: 'web',
            label: 'sealed',
            aaguid: 'fbfc3007-154e-4ecc-8c0b-6e020557d7bd',
            backedUp: true,
          },
          {
            credentialId: 'b',
            canUnlock: false,
            createdAt: 3,
            createdPlatform: 'visionos',
            backedUp: false,
          },
        ],
      })
    )
    const result = await listPasskeys(bearer)
    expect(seen[0].method).toBe('GET')
    expect(seen[0].url).toBe('https://api.test/accounts/v1/passkeys')
    expect(result.userHandle).toBe('handle')
    expect(result.passkeys).toEqual([
      {
        credentialId: 'a',
        canUnlock: true,
        createdAt: 1,
        lastUsedAt: 2,
        createdPlatform: 'web',
        label: 'sealed',
        aaguid: 'fbfc3007-154e-4ecc-8c0b-6e020557d7bd',
        backedUp: true,
      },
      {
        credentialId: 'b',
        canUnlock: false,
        createdAt: 3,
        createdPlatform: 'unknown',
        backedUp: false,
      },
    ])
  })

  it('lists an account without a user handle yet', async () => {
    const { bearer } = fakeFetch(() => json(200, { ok: true, passkeys: [] }))
    expect(await listPasskeys(bearer)).toEqual({ passkeys: [] })
  })

  it('removes a passkey signed and with the session', async () => {
    const { seen, both } = fakeFetch(() => json(200, { ok: true }))
    await removePasskey('cred', both)
    expect(seen[0].url).toBe('https://api.test/accounts/v1/passkeys/remove')
    expect(seen[0].headers.authorization).toBe('Bearer access')
    expect(verified('passkey/remove', seen[0].body)).toMatchObject({
      credentialId: 'cred',
    })
  })
})

describe('web sign-up and recovery', () => {
  it('asks for sign-up options with a Turnstile token', async () => {
    const { seen, plain } = fakeFetch(() =>
      json(200, {
        ok: true,
        accountId: ACCOUNT,
        challengeToken: 'ct',
        options: OPTIONS,
        userHandle: 'handle',
      })
    )
    expect(await webSignupOptions({ turnstileToken: 'tt' }, plain)).toEqual({
      accountId: ACCOUNT,
      challengeToken: 'ct',
      options: OPTIONS,
      userHandle: 'handle',
    })
    expect(seen[0].url).toBe('https://api.test/accounts/v1/web/signup/options')
    expect(seen[0].body).toEqual({ turnstileToken: 'tt' })
  })

  it('signs up and reads the web session', async () => {
    const { seen, sign } = fakeFetch(() =>
      json(201, {
        ok: true,
        accountId: ACCOUNT,
        status: 'active',
        sessionId: 'sid',
        accessToken: 'at',
        accessExpiresAt: 10,
        refreshToken: 'rt',
        sessionExpiresAt: 20,
        platform: 'web',
        credentialId: 'cred',
      })
    )
    const result = await webSignup(
      {
        challengeToken: 'ct',
        response: assertion(),
        wrapId: 'w',
        wrap: 'x',
        label: 'l',
        device: 'd',
        appVersion: '3.1.0',
      },
      sign
    )
    expect(result).toEqual({
      accountId: ACCOUNT,
      status: 'active',
      sessionId: 'sid',
      accessToken: 'at',
      accessExpiresAt: 10,
      refreshToken: 'rt',
      sessionExpiresAt: 20,
      credentialId: 'cred',
    })
    expect(seen[0].url).toBe('https://api.test/accounts/v1/web/signup')
    expect(seen[0].headers.authorization).toBeUndefined()
    const payload = verified('web/signup', seen[0].body)
    expect(payload).toMatchObject({
      challengeToken: 'ct',
      wrapId: 'w',
      wrap: 'x',
      label: 'l',
      device: 'd',
      appVersion: '3.1.0',
      capabilities: ['sync-everyone'],
    })
    expect(JSON.stringify(payload)).not.toContain(PRF)
  })

  it('leaves out an app version the server would refuse', async () => {
    const { seen, sign } = fakeFetch(() => json(500, { error: 'internal' }))
    await webSignup(
      { challengeToken: 'ct', response: assertion(), appVersion: '3.1' },
      sign
    ).catch(() => undefined)
    expect(verified('web/signup', seen[0].body)).not.toHaveProperty(
      'appVersion'
    )
  })

  it('asks for a recovery ticket', async () => {
    const { seen, sign } = fakeFetch(() =>
      json(200, {
        ok: true,
        accountId: ACCOUNT,
        ticket: 't',
        ticketExpiresAt: 9,
      })
    )
    expect(await webRecovery({ turnstileToken: 'tt' }, sign)).toEqual({
      accountId: ACCOUNT,
      ticket: 't',
      ticketExpiresAt: 9,
    })
    expect(seen[0].url).toBe('https://api.test/accounts/v1/web/recovery')
    expect(verified('web/recovery', seen[0].body)).toMatchObject({
      accountPub: key.publicKey,
      turnstileToken: 'tt',
    })
  })
})

describe('passkey failures', () => {
  const failing = (status: number, body: unknown, headers = {}) =>
    fakeFetch(
      () =>
        new Response(JSON.stringify(body), {
          status,
          headers: { 'content-type': 'application/json', ...headers },
        })
    )
  const failureOf = async (status: number, body: unknown, headers = {}) => {
    const { plain } = failing(status, body, headers)
    try {
      await startPasskeySignIn({}, plain)
    } catch (error) {
      return passkeyFailureFor(error)
    }
    throw new Error('did not fail')
  }

  it('reads passkey_failed with its reason', async () => {
    expect(
      await failureOf(403, { error: 'passkey_failed', reason: 'counter' })
    ).toEqual({
      failure: 'passkeyFailed',
      reason: 'counter',
      retryAfterMs: null,
    })
    expect(
      await failureOf(403, { error: 'passkey_failed', reason: 'new_reason' })
    ).toMatchObject({ failure: 'passkeyFailed', reason: 'unknown' })
  })

  it('reads the other new codes', async () => {
    expect(await failureOf(403, { error: 'ticket_invalid' })).toMatchObject({
      failure: 'ticketInvalid',
    })
    expect(
      await failureOf(403, {
        error: 'turnstile_failed',
        reason: 'timeout-or-duplicate',
      })
    ).toEqual({
      failure: 'turnstileFailed',
      reason: 'timeout-or-duplicate',
      retryAfterMs: null,
    })
    expect(await failureOf(403, { error: 'step_up_required' })).toMatchObject({
      failure: 'stepUpRequired',
    })
    expect(await failureOf(403, { error: 'key_retired' })).toMatchObject({
      failure: 'keyRetired',
    })
  })

  it('reads the shared codes', async () => {
    expect(
      await failureOf(429, { error: 'rate_limited' }, { 'retry-after': '30' })
    ).toEqual({ failure: 'rateLimited', reason: null, retryAfterMs: 30_000 })
    expect(await failureOf(429, { error: 'limit' })).toMatchObject({
      failure: 'limit',
    })
    expect(await failureOf(503, { error: 'disabled' })).toMatchObject({
      failure: 'unavailable',
    })
    expect(await failureOf(409, { error: 'conflict' })).toMatchObject({
      failure: 'conflict',
    })
    expect(await failureOf(404, { error: 'unknown_account' })).toMatchObject({
      failure: 'unknownAccount',
    })
    expect(await failureOf(404, { error: 'not_found' })).toMatchObject({
      failure: 'notFound',
    })
    expect(await failureOf(413, { error: 'too_large' })).toMatchObject({
      failure: 'tooLarge',
    })
    expect(await failureOf(426, { error: 'upgrade_required' })).toMatchObject({
      failure: 'updateRequired',
    })
    expect(await failureOf(500, { error: 'internal' })).toMatchObject({
      failure: 'server',
    })
  })

  it('reads offline and session failures', () => {
    expect(passkeyFailureFor(new HttpError('offline'))).toMatchObject({
      failure: 'offline',
    })
    expect(
      passkeyFailureFor(
        new AccountSessionError('attestation', { attestation: 'temporary' })
      )
    ).toMatchObject({ failure: 'verifyLater' })
    expect(
      passkeyFailureFor(
        new AccountSessionError('attestation', { attestation: 'device' })
      )
    ).toMatchObject({ failure: 'unverified' })
    expect(passkeyFailureFor(new Error('x'))).toMatchObject({
      failure: 'server',
    })
  })

  it('reads attestation_failed as handoff does', async () => {
    expect(
      await failureOf(403, {
        error: 'attestation_failed',
        reason: 'integrity_unavailable',
      })
    ).toMatchObject({ failure: 'verifyLater' })
    expect(
      await failureOf(403, {
        error: 'attestation_failed',
        reason: 'device_integrity_failed',
      })
    ).toMatchObject({ failure: 'unverified' })
  })
})
