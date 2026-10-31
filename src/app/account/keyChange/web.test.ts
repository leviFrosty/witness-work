import { describe, expect, it, vi } from 'vitest'
import { toB64u } from '@/lib/bytes'
import { HttpError } from '@/lib/http/request'
import { PasskeyError } from '@/lib/passkeys/errors'
import type { AccountDevice } from '@/lib/serverAccount/activityClient'
import type { PasskeyAssertion } from '@/lib/passkeys/types'
import type { Passkey } from '@/lib/serverAccount/passkeyClient'
import { openPasskeyWraps } from '@/lib/serverAccount/passkeys'
import { accountPubOf } from '@/lib/serverAccount/keys'
import { KeyChangeError } from './engine'
import { createWebKeyChange, KEY_CHANGE_SESSION_AGE_MS } from './web'

const ACCOUNT = 'A'.repeat(22)
const NOW = 1_800_000_000_000
const K2 = new Uint8Array(32).fill(2)
const PRF = new Uint8Array(32).fill(9)
const CREDENTIAL = toB64u(new Uint8Array(16).fill(4))

const device = (overrides: Partial<AccountDevice>): AccountDevice => ({
  sessionId: 's',
  platform: 'web',
  device: null,
  appVersion: '1.47.0',
  current: false,
  createdAt: NOW - 10 * KEY_CHANGE_SESSION_AGE_MS,
  lastActiveAt: NOW,
  expiresAt: NOW + 1,
  ...overrides,
})

const passkey: Passkey = {
  credentialId: CREDENTIAL,
  canUnlock: true,
  createdAt: 1,
  createdPlatform: 'web',
  backedUp: true,
} as Passkey

const response = { id: CREDENTIAL } as PasskeyAssertion['response']

function setup() {
  let nonce = 0
  const deps = {
    now: () => NOW,
    randomBytes: (length: number) => new Uint8Array(length).fill(++nonce),
    devices: vi.fn(async () => [
      device({ sessionId: 'phone', platform: 'ios' }),
      device({ sessionId: 'me', current: true }),
    ]),
    passkeys: vi.fn(async () => ({ passkeys: [passkey] })),
    startStepUp: vi.fn(async () => ({
      challengeToken: 'challenge-token',
      options: { challenge: 'c', allowCredentials: [] },
    })),
    getPasskey: vi.fn(
      async (): Promise<PasskeyAssertion> => ({ response, prf: PRF })
    ),
    finishStepUp: vi.fn(async () => ({
      credentialId: CREDENTIAL,
      stepUpAt: NOW,
    })),
  }
  return { deps, web: createWebKeyChange(deps) }
}

describe('changing the key in a browser', () => {
  it('lets a session a day old with a passkey change the key', async () => {
    const { web } = setup()
    await expect(web.precheck()).resolves.toBeUndefined()
  })

  it('refuses a session younger than a day, saying from when it may', async () => {
    const { deps, web } = setup()
    const createdAt = NOW - KEY_CHANGE_SESSION_AGE_MS + 60_000
    deps.devices.mockResolvedValue([device({ current: true, createdAt })])
    const error = await web.precheck().catch((e: unknown) => e)
    expect(error).toBeInstanceOf(KeyChangeError)
    expect(error).toMatchObject({
      reason: 'session_too_new',
      availableAt: createdAt + KEY_CHANGE_SESSION_AGE_MS,
    })
  })

  it('refuses an account without a passkey to confirm with', async () => {
    const { deps, web } = setup()
    deps.passkeys.mockResolvedValue({ passkeys: [] })
    await expect(web.precheck()).rejects.toMatchObject({
      reason: 'no_passkey',
    })
  })

  it('steps up, and wraps the new key for the new epoch with the passkey’s PRF', async () => {
    const { deps, web } = setup()
    const { passkeyWrap } = await web.stepUp({
      newKey: K2,
      accountId: ACCOUNT,
      keyEpoch: 4,
    })
    expect(deps.getPasskey).toHaveBeenCalledWith({
      challenge: 'c',
      allowCredentials: [],
    })
    expect(deps.finishStepUp).toHaveBeenCalledWith({
      challengeToken: 'challenge-token',
      response,
    })
    expect(passkeyWrap).toMatchObject({ credentialId: CREDENTIAL })
    expect(passkeyWrap!.wrapId).toMatch(/^[A-Za-z0-9_-]{22}$/)
    const opened = openPasskeyWraps({
      prfOutput: PRF,
      accountId: ACCOUNT,
      accountPub: accountPubOf(K2),
      credentialId: CREDENTIAL,
      keyEpoch: 4,
      wraps: [{ ...passkeyWrap!, keyEpoch: 4 }],
    })
    expect(opened).toMatchObject({ ok: true, accountKey: K2 })
    // Bound to the epoch: it doesn't open as the old one's.
    expect(
      openPasskeyWraps({
        prfOutput: PRF,
        accountId: ACCOUNT,
        accountPub: accountPubOf(K2),
        credentialId: CREDENTIAL,
        keyEpoch: 3,
        wraps: [{ ...passkeyWrap!, keyEpoch: 3 }],
      })
    ).toMatchObject({ ok: false })
  })

  it('sends no wrap for a passkey without PRF', async () => {
    const { deps, web } = setup()
    deps.getPasskey.mockResolvedValue({ response, prf: null })
    expect(
      await web.stepUp({ newKey: K2, accountId: ACCOUNT, keyEpoch: 1 })
    ).toEqual({})
  })

  it('reads a cancelled or refused passkey check as a step-up that didn’t pass', async () => {
    const { deps, web } = setup()
    deps.getPasskey.mockRejectedValueOnce(new PasskeyError('cancelled'))
    await expect(
      web.stepUp({ newKey: K2, accountId: ACCOUNT, keyEpoch: 1 })
    ).rejects.toMatchObject({ reason: 'step_up' })
    deps.finishStepUp.mockRejectedValueOnce(
      new HttpError('client', 403, 'passkey_failed')
    )
    await expect(
      web.stepUp({ newKey: K2, accountId: ACCOUNT, keyEpoch: 1 })
    ).rejects.toMatchObject({ reason: 'step_up' })
  })

  it('passes connection failures on, for the engine to read as offline', async () => {
    const { deps, web } = setup()
    const offline = new HttpError('offline', null, null)
    deps.startStepUp.mockRejectedValueOnce(offline)
    await expect(
      web.stepUp({ newKey: K2, accountId: ACCOUNT, keyEpoch: 1 })
    ).rejects.toBe(offline)
  })
})
