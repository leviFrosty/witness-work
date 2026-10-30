import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { toB64u } from '@/lib/bytes'
import {
  PRF_SALT,
  PasskeyError,
  createPasskey,
  getPasskey,
  passkeySupport,
} from '@/lib/passkeys/index.web'
import type {
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
} from '@/lib/passkeys/types'

const SALT = new TextEncoder().encode('ww-account/v1/passkey-prf')
const PRF = new Uint8Array(32).fill(9)
const bytes = (...values: number[]) => new Uint8Array(values).buffer

const creation: PublicKeyCredentialCreationOptionsJSON = {
  rp: { id: 'app-dev.witnesswork.app', name: 'WitnessWork' },
  user: {
    id: 'AAEC',
    name: 'WitnessWork KVW7',
    displayName: 'WitnessWork KVW7',
  },
  challenge: 'Y2hhbGxlbmdl',
  pubKeyCredParams: [{ type: 'public-key', alg: -7 }],
  authenticatorSelection: {
    residentKey: 'required',
    userVerification: 'required',
  },
  attestation: 'none',
}

const request: PublicKeyCredentialRequestOptionsJSON = {
  rpId: 'app-dev.witnesswork.app',
  challenge: 'Y2hhbGxlbmdl',
  userVerification: 'required',
}

/** What `navigator.credentials` resolves with: ArrayBuffers throughout. */
const credential = (
  response: Record<string, unknown>,
  extensions: Record<string, unknown>
) => ({
  id: 'AQID',
  rawId: bytes(1, 2, 3),
  type: 'public-key',
  authenticatorAttachment: 'platform',
  response,
  getClientExtensionResults: () => extensions,
})

const attestation = {
  clientDataJSON: bytes(123, 125),
  attestationObject: bytes(4, 5),
  getTransports: () => ['internal', 'hybrid'],
}

const authentication = {
  clientDataJSON: bytes(123, 125),
  authenticatorData: bytes(6),
  signature: bytes(7),
  userHandle: bytes(0, 1, 2),
}

const credentials = { create: vi.fn(), get: vi.fn() }
const PublicKeyCredential = Object.assign(function PublicKeyCredential() {}, {
  getClientCapabilities: vi.fn(),
})

beforeEach(() => {
  vi.stubGlobal('PublicKeyCredential', PublicKeyCredential)
  vi.stubGlobal('navigator', { credentials })
  vi.stubGlobal('location', { hostname: 'app-dev.witnesswork.app' })
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

const sentPublicKey = (mock: typeof credentials.create) =>
  (
    mock.mock.calls[0][0] as {
      publicKey: { extensions: { prf: { eval: { first: unknown } } } }
    }
  ).publicKey

describe('passkeySupport', () => {
  it.each([
    [true, 'yes'],
    [false, 'no'],
    [undefined, 'unknown'],
  ] as const)('reads extension:prf %s as %s', async (value, prf) => {
    PublicKeyCredential.getClientCapabilities.mockResolvedValue({
      'extension:prf': value,
    })
    expect(await passkeySupport()).toEqual({ passkeys: true, prf })
  })

  it('is unknown without getClientCapabilities', async () => {
    vi.stubGlobal('PublicKeyCredential', function PublicKeyCredential() {})
    expect(await passkeySupport()).toEqual({ passkeys: true, prf: 'unknown' })
  })

  it('reports no passkeys without WebAuthn', async () => {
    vi.stubGlobal('PublicKeyCredential', undefined)
    expect(await passkeySupport()).toEqual({ passkeys: false, prf: 'no' })
  })
})

describe('createPasskey', () => {
  it('hands the browser the salt as an ArrayBuffer', async () => {
    credentials.create.mockResolvedValue(
      credential(attestation, { prf: { enabled: true } })
    )
    await createPasskey(creation)
    const first = sentPublicKey(credentials.create).extensions.prf.eval.first
    expect(first).toBeInstanceOf(ArrayBuffer)
    expect(new Uint8Array(first as ArrayBuffer)).toEqual(SALT)
  })

  it('hands each ceremony its own copy of the salt', async () => {
    credentials.create.mockResolvedValue(credential(attestation, {}))
    await createPasskey(creation)
    await createPasskey(creation)
    const [first, second] = credentials.create.mock.calls.map(
      ([options]) =>
        (
          options as {
            publicKey: { extensions: { prf: { eval: { first: ArrayBuffer } } } }
          }
        ).publicKey.extensions.prf.eval.first
    )
    expect(first).not.toBe(second)
    expect(first).not.toBe(PRF_SALT.buffer)
  })

  it('strips PRF from the JSON response and returns the output as bytes', async () => {
    credentials.create.mockResolvedValue(
      credential(attestation, {
        credProps: { rk: true },
        prf: { enabled: true, results: { first: PRF.slice().buffer } },
      })
    )
    const { response, prf } = await createPasskey(creation)
    expect(response).toMatchObject({
      id: 'AQID',
      rawId: 'AQID',
      type: 'public-key',
      authenticatorAttachment: 'platform',
      response: {
        clientDataJSON: 'e30',
        attestationObject: 'BAU',
        transports: ['internal', 'hybrid'],
      },
      clientExtensionResults: { credProps: { rk: true } },
    })
    expect(response.clientExtensionResults).not.toHaveProperty('prf')
    expect(prf).toEqual({ enabled: true, first: PRF })
  })

  it('reports no PRF facts when the browser gives none', async () => {
    credentials.create.mockResolvedValue(credential(attestation, {}))
    expect((await createPasskey(creation)).prf).toEqual({
      enabled: null,
      first: null,
    })
  })

  it.each([
    ['NotAllowedError', 'cancelled'],
    ['AbortError', 'cancelled'],
    ['TimeoutError', 'timeout'],
    ['SecurityError', 'domain_not_associated'],
    ['NotSupportedError', 'not_supported'],
    ['InvalidStateError', 'already_registered'],
    ['UnknownError', 'failed'],
  ] as const)('maps %s to %s', async (name, code) => {
    credentials.create.mockRejectedValue(new DOMException('nope', name))
    const error = await createPasskey(creation).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(PasskeyError)
    expect(error).toMatchObject({ code })
  })

  it('maps an RP ID this page may not use to domain_not_associated', async () => {
    vi.stubGlobal('location', { hostname: 'evil.example' })
    credentials.create.mockRejectedValue(
      new DOMException('no', 'SecurityError')
    )
    await expect(createPasskey(creation)).rejects.toMatchObject({
      code: 'domain_not_associated',
    })
  })

  it('rejects not_supported without WebAuthn', async () => {
    vi.stubGlobal('PublicKeyCredential', undefined)
    await expect(createPasskey(creation)).rejects.toMatchObject({
      code: 'not_supported',
    })
    expect(credentials.create).not.toHaveBeenCalled()
  })
})

describe('getPasskey', () => {
  it('sends the salt and returns the PRF output apart from the response', async () => {
    credentials.get.mockResolvedValue(
      credential(authentication, {
        prf: { results: { first: PRF.slice().buffer } },
      })
    )
    const { response, prf } = await getPasskey(request)
    const first = sentPublicKey(credentials.get).extensions.prf.eval.first
    expect(new Uint8Array(first as ArrayBuffer)).toEqual(SALT)
    expect(prf).toEqual(PRF)
    expect(response.response).toEqual({
      clientDataJSON: 'e30',
      authenticatorData: 'Bg',
      signature: 'Bw',
      userHandle: toB64u(new Uint8Array([0, 1, 2])),
    })
    expect(response.clientExtensionResults).toEqual({})
  })

  it('returns null PRF for a passkey that only signs in', async () => {
    credentials.get.mockResolvedValue(credential(authentication, {}))
    expect((await getPasskey(request)).prf).toBeNull()
  })

  it('returns null PRF for output of the wrong length', async () => {
    credentials.get.mockResolvedValue(
      credential(authentication, {
        prf: { results: { first: new Uint8Array(16).buffer } },
      })
    )
    expect((await getPasskey(request)).prf).toBeNull()
  })

  it('maps a cancelled sheet', async () => {
    credentials.get.mockRejectedValue(new DOMException('x', 'NotAllowedError'))
    await expect(getPasskey(request)).rejects.toMatchObject({
      code: 'cancelled',
    })
  })
})
