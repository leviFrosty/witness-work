import { beforeEach, describe, expect, it, vi } from 'vitest'

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

import { createNamespace } from '../test/durableObjects'
import { createTestServiceAccount } from '../test/googleServiceAccount'
import type { Environment } from '../types'
import { PlayIntegrityChallenges } from './challengeDO'
import { resetGoogleAuthState } from '../googleAuth'
import {
  PlayIntegrityError,
  issuePlayIntegrityChallenge,
  verifyPlayIntegrityAssertion,
  type PlayIntegrityServiceEnv,
} from './index'
import {
  computePlayIntegrityRequestBinding,
  type PlayIntegrityChallengeRequest,
} from './protocol'

const NOW = 1_800_000_000_000
const PACKAGE = 'com.example.app'

const request: PlayIntegrityChallengeRequest = {
  attestationProvider: 'play-integrity',
  protocolVersion: 1,
  operation: 'assert',
  operationId: 'play-operation-1',
  uuid: 'install-uuid-1',
  accountId: 'account-id-1',
  purpose: 'notes-import-kickoff',
  contentHash: 'a'.repeat(64),
  requestHash: 'b'.repeat(64),
}

const payloadFor = (binding: string, override: Record<string, unknown> = {}) => ({
  tokenPayloadExternal: {
    requestDetails: {
      requestPackageName: PACKAGE,
      requestHash: binding,
      timestampMillis: String(NOW),
    },
    appIntegrity: {
      appRecognitionVerdict: 'PLAY_RECOGNIZED',
      packageName: PACKAGE,
      certificateSha256Digest: ['cert'],
      versionCode: '142',
    },
    deviceIntegrity: { deviceRecognitionVerdict: ['MEETS_DEVICE_INTEGRITY'] },
    ...override,
  },
})

const setup = async (
  decode: (binding: string) => Response | Promise<Response>
) => {
  const account = await createTestServiceAccount()
  const namespace = createNamespace(
    (state) =>
      new PlayIntegrityChallenges(state, {} as Environment, {
        now: () => NOW,
        randomChallenge: () => 'C'.repeat(43),
      })
  )
  const env = {
    ANDROID_PACKAGE_NAME: PACKAGE,
    PLAY_INTEGRITY_CLOUD_PROJECT_NUMBER: '123456789012',
    PLAY_INTEGRITY_SERVICE_ACCOUNT_JSON: account.json,
    PLAY_INTEGRITY_CHALLENGES: namespace.namespace,
  } as unknown as PlayIntegrityServiceEnv
  const challenge = (await issuePlayIntegrityChallenge(env, request)).challenge
  const binding = await computePlayIntegrityRequestBinding({
    ...request,
    challenge,
  })
  const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    if (url === 'https://oauth2.googleapis.com/token') {
      return Response.json({ access_token: 'ya29.test', expires_in: 3600 })
    }
    expect(url).toBe(
      `https://playintegrity.googleapis.com/v1/${PACKAGE}:decodeIntegrityToken`
    )
    expect(new Headers(init?.headers).get('authorization')).toBe(
      'Bearer ya29.test'
    )
    expect(JSON.parse(String(init?.body))).toEqual({ integrityToken: 'token.abc' })
    return decode(binding)
  })
  const report = vi.fn()
  const verify = () =>
    verifyPlayIntegrityAssertion(
      env,
      { ...request, challenge, integrityToken: 'token.abc' },
      { fetch, now: () => NOW, report }
    )
  return { env, verify, fetch, report }
}

const reasonOf = async (promise: Promise<unknown>) => {
  try {
    await promise
  } catch (error) {
    if (error instanceof PlayIntegrityError) return error.reason
    throw error
  }
  return 'ok'
}

describe('verifyPlayIntegrityAssertion', () => {
  beforeEach(() => resetGoogleAuthState())

  it('accepts a genuine token bound to the consumed challenge', async () => {
    const { verify } = await setup((binding) => Response.json(payloadFor(binding)))
    await expect(verify()).resolves.toEqual({
      ok: true,
      attestationProvider: 'play-integrity',
      protocolVersion: 1,
      operationId: 'play-operation-1',
    })
  })

  it('spends the challenge before decoding, so a replay never reaches Google', async () => {
    const { verify, fetch } = await setup((binding) =>
      Response.json(payloadFor(binding))
    )
    await verify()
    const calls = fetch.mock.calls.length
    await expect(reasonOf(verify())).resolves.toBe('challenge_not_found')
    expect(fetch).toHaveBeenCalledTimes(calls)
  })

  it('rejects a token whose request hash binds other data', async () => {
    const { verify } = await setup(() => Response.json(payloadFor('f'.repeat(64))))
    await expect(reasonOf(verify())).resolves.toBe('integrity_token_invalid')
  })

  it('maps device and app verdict failures', async () => {
    const device = await setup((binding) =>
      Response.json(
        payloadFor(binding, { deviceIntegrity: { deviceRecognitionVerdict: [] } })
      )
    )
    await expect(reasonOf(device.verify())).resolves.toBe(
      'device_integrity_failed'
    )
    resetGoogleAuthState()
    const app = await setup((binding) =>
      Response.json(
        payloadFor(binding, {
          appIntegrity: { appRecognitionVerdict: 'UNRECOGNIZED_VERSION' },
        })
      )
    )
    await expect(reasonOf(app.verify())).resolves.toBe('app_not_recognized')
  })

  it('treats a 400 from Google as an invalid token, not an outage', async () => {
    const { verify, report } = await setup(
      () => new Response('{}', { status: 400 })
    )
    await expect(reasonOf(verify())).resolves.toBe('integrity_token_invalid')
    expect(report).not.toHaveBeenCalled()
  })

  it.each([403, 429, 503])(
    'reports Google HTTP %i as retryable unavailability',
    async (status) => {
      const { verify, report } = await setup(
        () => new Response('{}', { status })
      )
      await expect(reasonOf(verify())).resolves.toBe('integrity_unavailable')
      expect(report).toHaveBeenCalledTimes(1)
      expect(String(report.mock.calls[0][0].message)).toContain(String(status))
    }
  )

  it('fails closed when the worker is not configured', async () => {
    const { env } = await setup((binding) => Response.json(payloadFor(binding)))
    const unconfigured = { ...env, PLAY_INTEGRITY_SERVICE_ACCOUNT_JSON: '' }
    await expect(
      reasonOf(issuePlayIntegrityChallenge(unconfigured, request))
    ).resolves.toBe('integrity_unavailable')
    await expect(
      reasonOf(
        verifyPlayIntegrityAssertion(
          unconfigured,
          { ...request, challenge: 'C'.repeat(43), integrityToken: 't' },
          { fetch: vi.fn(), now: () => NOW, report: vi.fn() }
        )
      )
    ).resolves.toBe('integrity_unavailable')
  })
})
