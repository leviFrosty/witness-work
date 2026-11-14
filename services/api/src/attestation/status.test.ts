import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('cloudflare:workers', () => ({ DurableObject: class {} }))

import { app } from '../app'
import { makeMemoryKv } from '../test/memoryKv'
import type { Environment } from '../types'
import { attestationStatus } from './status'

/**
 * `GET /attestation/v1/status` answers the same attestation capabilities as
 * `GET /notes-import/status` (which adds Notes Import's `transcribe`), so the
 * app can read them here once Notes Import is gone.
 */

const ORIGIN = 'https://ww-proxy.leviwilkerson.com'

const makeEnv = (overrides: Record<string, unknown> = {}) =>
  ({
    APP_ATTEST_ENVIRONMENT: 'production',
    NOTES_KV: makeMemoryKv(),
    RATE_LIMITER: { limit: async () => ({ success: true }) },
    OPENROUTER_API_KEY: 'or-test',
    ...overrides,
  }) as unknown as Environment

const PLAY_INTEGRITY = {
  ANDROID_PACKAGE_NAME: 'com.leviwilkerson.jwtime',
  PLAY_INTEGRITY_CLOUD_PROJECT_NUMBER: '123456789012',
  PLAY_INTEGRITY_SERVICE_ACCOUNT_JSON: '{"type":"service_account"}',
}

const get = async (env: Environment, path: string) => {
  const response = await app.fetch(
    new Request(`${ORIGIN}${path}`, { headers: { 'cf-connecting-ip': '198.18.0.9' } }),
    env,
    { waitUntil: () => undefined, passThroughOnException: () => undefined } as never
  )
  return { status: response.status, body: (await response.json()) as Record<string, any> }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('GET /attestation/v1/status', () => {
  it.each([
    ['iOS only', {}],
    ['iOS and Android', PLAY_INTEGRITY],
  ])('matches /notes-import/status capabilities (%s)', async (_, overrides) => {
    // Notes Import's provider-health probe; not part of the capabilities.
    vi.stubGlobal('fetch', async () => new Response('{}', { status: 503 }))
    const env = makeEnv(overrides)
    const attestation = await get(env, '/attestation/v1/status')
    const notesImport = await get(env, '/notes-import/status')
    expect(attestation.status).toBe(200)
    expect(notesImport.status).toBe(200)
    const { transcribe, ...capabilities } = notesImport.body.capabilities
    expect(transcribe).toBeDefined()
    expect(attestation.body).toEqual({ ok: true, capabilities, providers: capabilities })
  })

  it('carries the Play Integrity project when Android is configured', () => {
    expect(attestationStatus(makeEnv(PLAY_INTEGRITY)).capabilities).toEqual({
      appAttest: { protocolVersions: [1, 2] },
      playIntegrity: { protocolVersions: [1], cloudProjectNumber: '123456789012' },
    })
  })

  it('is reused per isolate for 30 seconds', () => {
    const env = makeEnv()
    const first = attestationStatus(env, 0)
    expect(attestationStatus(env, 29_999)).toBe(first)
    expect(attestationStatus(env, 30_000)).not.toBe(first)
  })
})
