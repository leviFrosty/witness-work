import { sha256 } from '@noble/hashes/sha2.js'
import { describe, expect, it, vi } from 'vitest'
import { concatBytes, fromB64u, toB64u, utf8 } from '@/lib/bytes'
import { PasskeyError } from '@/lib/passkeys/errors'
import type {
  PasskeyAssertion,
  PublicKeyCredentialRequestOptionsJSON,
} from '@/lib/passkeys/types'
import type { StepUpPasskey } from '@/lib/serverAccount/stepUp'
import {
  checkLockAssertion,
  createWebAppLock,
  type WebLockCredentials,
} from '@/lib/webAppLock'

const ORIGIN = 'https://app.witnesswork.app'
const RP_ID = 'app.witnesswork.app'
const CREDENTIAL = 'Y3JlZA'
const OTHER = 'b3RoZXI'

/** An authenticator's answer to `options`, shaped as WebAuthn's JSON. */
function answer(
  challenge: string,
  {
    id = CREDENTIAL,
    origin = ORIGIN,
    rpId = RP_ID,
    flags = 0x05,
    type = 'webauthn.get',
  }: Partial<{
    id: string
    origin: string
    rpId: string
    flags: number
    type: string
  }> = {}
): PasskeyAssertion {
  const clientData = JSON.stringify({ type, challenge, origin })
  const authenticatorData = concatBytes(
    sha256(utf8(rpId)),
    new Uint8Array([flags]),
    new Uint8Array(4)
  )
  return {
    response: {
      id,
      rawId: id,
      type: 'public-key',
      response: {
        clientDataJSON: toB64u(utf8(clientData)),
        authenticatorData: toB64u(authenticatorData),
        signature: 'c2ln',
      },
      clientExtensionResults: {},
    },
    prf: null,
  }
}

const CREDENTIALS: WebLockCredentials = { rpId: RP_ID, ids: [CREDENTIAL] }

describe('checkLockAssertion', () => {
  const check = (assertion: PasskeyAssertion, challenge = 'Y2g') =>
    checkLockAssertion(assertion.response, {
      challenge,
      credentials: CREDENTIALS,
      origin: ORIGIN,
    })

  it('passes the account’s passkey, verified, for this page', () => {
    expect(check(answer('Y2g'))).toBe('ok')
  })

  it.each([
    ['another passkey', answer('Y2g', { id: OTHER }), 'wrong_credential'],
    ['another challenge', answer('b3RoZXI'), 'challenge'],
    [
      'another origin',
      answer('Y2g', { origin: 'https://evil.example' }),
      'origin',
    ],
    ['another RP ID', answer('Y2g', { rpId: 'evil.example' }), 'rp_id'],
    [
      'no user verification',
      answer('Y2g', { flags: 0x01 }),
      'user_verification',
    ],
    ['no user presence', answer('Y2g', { flags: 0x04 }), 'user_verification'],
    ['a registration', answer('Y2g', { type: 'webauthn.create' }), 'malformed'],
  ] as const)('refuses %s', (_, assertion, reason) => {
    expect(check(assertion)).toBe(reason)
  })

  it('refuses data that doesn’t parse', () => {
    const broken = answer('Y2g')
    broken.response.response.clientDataJSON = toB64u(utf8('{'))
    expect(check(broken)).toBe('malformed')
    const short = answer('Y2g')
    short.response.response.authenticatorData = toB64u(new Uint8Array(10))
    expect(check(short)).toBe('malformed')
  })
})

describe('createWebAppLock', () => {
  function setup(kept: WebLockCredentials | null = CREDENTIALS) {
    let stored = kept
    const get = vi.fn(async (options: PublicKeyCredentialRequestOptionsJSON) =>
      answer(options.challenge)
    )
    const lock = createWebAppLock({
      get,
      randomBytes: (length) => new Uint8Array(length).fill(3),
      origin: () => ORIGIN,
      credentials: {
        read: () => stored,
        write: (next) => (stored = next),
      },
    })
    return { lock, get, stored: () => stored }
  }

  const stepUp = (
    overrides: Partial<StepUpPasskey> = {},
    assertion = answer('c2VydmVy')
  ): StepUpPasskey => ({
    status: 'confirmed',
    via: 'passkey',
    rpId: RP_ID,
    credentialIds: [CREDENTIAL, OTHER],
    credentialId: CREDENTIAL,
    assertion,
    challenge: 'c2VydmVy',
    until: 1,
    ...overrides,
  })

  describe('turning it on', () => {
    it('keeps the step-up’s passkeys and RP ID once its get passes here too', () => {
      const { lock, stored } = setup(null)
      expect(lock.enable(stepUp())).toEqual({
        status: 'enabled',
        credentials: { rpId: RP_ID, ids: [CREDENTIAL, OTHER] },
      })
      expect(stored()).toEqual({ rpId: RP_ID, ids: [CREDENTIAL, OTHER] })
    })

    it('stays off when the get wouldn’t pass the device’s check', () => {
      const { lock, stored } = setup(null)
      expect(
        lock.enable(stepUp({}, answer('c2VydmVy', { flags: 0x01 })))
      ).toEqual({ status: 'refused', reason: 'user_verification' })
      expect(stored()).toBeNull()
    })

    it('stays off without an RP ID or passkeys to unlock with', () => {
      const { lock, stored } = setup(null)
      expect(lock.enable(stepUp({ rpId: null }))).toMatchObject({
        status: 'refused',
      })
      expect(lock.enable(stepUp({ credentialIds: [] }))).toMatchObject({
        status: 'refused',
      })
      expect(stored()).toBeNull()
    })
  })

  describe('unlocking', () => {
    it('asks for the kept passkeys with a challenge of its own, verified', async () => {
      const { lock, get } = setup()
      expect(await lock.unlock()).toEqual({ status: 'unlocked' })
      expect(get).toHaveBeenCalledExactlyOnceWith({
        rpId: RP_ID,
        challenge: toB64u(new Uint8Array(32).fill(3)),
        allowCredentials: [{ id: CREDENTIAL, type: 'public-key' }],
        userVerification: 'required',
        timeout: 300_000,
      })
    })

    it('works offline: nothing but the passkey is asked', async () => {
      const fetch = vi.spyOn(globalThis, 'fetch')
      const { lock } = setup()
      expect(await lock.unlock()).toEqual({ status: 'unlocked' })
      expect(fetch).not.toHaveBeenCalled()
      fetch.mockRestore()
    })

    it('refuses another passkey', async () => {
      const { lock, get } = setup()
      get.mockImplementationOnce(async (options) =>
        answer(options.challenge, { id: OTHER })
      )
      expect(await lock.unlock()).toEqual({
        status: 'refused',
        reason: 'wrong_credential',
      })
    })

    it('refuses an answer to another challenge', async () => {
      const { lock, get } = setup()
      get.mockImplementationOnce(async () => answer(toB64u(fromB64u('AAAA'))))
      expect(await lock.unlock()).toEqual({
        status: 'refused',
        reason: 'challenge',
      })
    })

    it('stays locked when the User cancels', async () => {
      const { lock, get } = setup()
      get.mockRejectedValueOnce(new PasskeyError('cancelled'))
      expect(await lock.unlock()).toEqual({ status: 'cancelled' })
    })

    it('says when the passkey isn’t here', async () => {
      const { lock, get } = setup()
      get.mockRejectedValueOnce(new PasskeyError('no_credentials'))
      expect(await lock.unlock()).toEqual({
        status: 'failed',
        reason: 'no_credentials',
      })
    })

    it('never runs a discoverable get', async () => {
      for (const kept of [null, { rpId: RP_ID, ids: [] }]) {
        const { lock, get } = setup(kept)
        expect(await lock.unlock()).toEqual({ status: 'noCredentials' })
        expect(get).not.toHaveBeenCalled()
      }
    })
  })

  describe('keeping the passkeys current', () => {
    it('drops passkeys the account no longer lists', () => {
      const { lock, stored } = setup({ rpId: RP_ID, ids: [CREDENTIAL, OTHER] })
      expect(lock.keepListed([OTHER, 'bmV3'])).toBe(true)
      expect(stored()).toEqual({ rpId: RP_ID, ids: [OTHER] })
      expect(lock.keepListed([])).toBe(false)
      expect(stored()).toBeNull()
    })

    it('takes a later step-up’s passkeys for the same RP ID', () => {
      const { lock, stored } = setup()
      lock.noteStepUp(stepUp({ credentialIds: [OTHER] }))
      expect(stored()).toEqual({ rpId: RP_ID, ids: [OTHER] })
      lock.noteStepUp(stepUp({ rpId: 'localhost', credentialIds: ['eA'] }))
      expect(stored()).toEqual({ rpId: RP_ID, ids: [OTHER] })
    })

    it('keeps nothing from a step-up while the lock is off', () => {
      const { lock, stored } = setup(null)
      lock.noteStepUp(stepUp())
      expect(stored()).toBeNull()
    })
  })
})
