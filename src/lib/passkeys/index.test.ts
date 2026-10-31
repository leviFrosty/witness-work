import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fromB64u, toB64u } from '@/lib/bytes'
import { NativePasskeyError } from '../../../modules/passkeys/errorCodes'
import type {
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
} from '@/lib/passkeys/types'

const native = vi.hoisted(() => ({
  isAvailable: vi.fn(),
  getSupport: vi.fn(),
  create: vi.fn(),
  get: vi.fn(),
}))
vi.mock('../../../modules/passkeys', () => native)

const {
  PRF_SALT,
  PasskeyError,
  createPasskey,
  getPasskey,
  passkeySupport,
  passkeysLinked,
} = await import('@/lib/passkeys')

const SALT = new TextEncoder().encode('ww-account/v1/passkey-prf')
const PRF = new Uint8Array(32).fill(9)

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
  extensions: { credProps: true },
}

const request: PublicKeyCredentialRequestOptionsJSON = {
  rpId: 'app-dev.witnesswork.app',
  challenge: 'Y2hhbGxlbmdl',
  userVerification: 'required',
  allowCredentials: [{ id: 'Y3JlZA', type: 'public-key' }],
}

const registration = (prf: unknown) =>
  JSON.stringify({
    id: 'Y3JlZA',
    rawId: 'Y3JlZA',
    type: 'public-key',
    authenticatorAttachment: 'platform',
    response: {
      clientDataJSON: 'e30',
      attestationObject: 'o2Nm',
      transports: ['internal', 'hybrid'],
    },
    clientExtensionResults: prf === undefined ? {} : { prf },
  })

const assertion = (prf: unknown) =>
  JSON.stringify({
    id: 'Y3JlZA',
    rawId: 'Y3JlZA',
    type: 'public-key',
    authenticatorAttachment: 'platform',
    response: {
      clientDataJSON: 'e30',
      authenticatorData: 'YXV0aA',
      signature: 'c2ln',
      userHandle: 'AAEC',
    },
    clientExtensionResults: prf === undefined ? {} : { prf },
  })

const sentOptions = (mock: typeof native.create) =>
  JSON.parse(mock.mock.calls[0][0] as string) as {
    extensions: { prf: { eval: { first: string } } }
  }

beforeEach(() => {
  vi.clearAllMocks()
})

it('exports the one PRF salt', () => {
  expect(PRF_SALT).toEqual(SALT)
})

it('reports whether the binary has the module', () => {
  native.isAvailable.mockReturnValue(false)
  expect(passkeysLinked()).toBe(false)
  native.isAvailable.mockReturnValue(true)
  expect(passkeysLinked()).toBe(true)
})

describe('passkeySupport', () => {
  it('returns what the module reports', async () => {
    native.getSupport.mockResolvedValue({ passkeys: true, prf: 'yes' })
    expect(await passkeySupport()).toEqual({ passkeys: true, prf: 'yes' })
  })

  it('reports no passkeys when the module throws', async () => {
    native.getSupport.mockRejectedValue(new Error('boom'))
    expect(await passkeySupport()).toEqual({ passkeys: false, prf: 'no' })
  })
})

describe('createPasskey', () => {
  it('sends the options with the salt as base64url eval.first', async () => {
    native.create.mockResolvedValue(registration({ enabled: true }))
    await createPasskey(creation)
    const sent = sentOptions(native.create)
    expect(sent.extensions).toEqual({
      credProps: true,
      prf: { eval: { first: toB64u(SALT) } },
    })
    expect(fromB64u(sent.extensions.prf.eval.first)).toEqual(SALT)
    expect({ ...sent, extensions: undefined }).toEqual({
      ...creation,
      extensions: undefined,
    })
  })

  it('strips PRF from the response and returns it as bytes', async () => {
    native.create.mockResolvedValue(
      registration({ enabled: true, results: { first: toB64u(PRF) } })
    )
    const { response, prf } = await createPasskey(creation)
    expect(response.clientExtensionResults).toEqual({})
    expect(JSON.stringify(response)).not.toContain(toB64u(PRF))
    expect(response.response.attestationObject).toBe('o2Nm')
    expect(prf).toEqual({ enabled: true, first: PRF })
  })

  it('reports enabled without output, and nothing when PRF is absent', async () => {
    native.create.mockResolvedValue(registration({ enabled: false }))
    expect((await createPasskey(creation)).prf).toEqual({
      enabled: false,
      first: null,
    })
    native.create.mockResolvedValue(registration(undefined))
    expect((await createPasskey(creation)).prf).toEqual({
      enabled: null,
      first: null,
    })
  })

  it.each([
    'cancelled',
    'not_supported',
    'no_credentials',
    'timeout',
    'domain_not_associated',
    'already_registered',
    'failed',
  ] as const)('rejects with the module code %s', async (code) => {
    native.create.mockRejectedValue(new NativePasskeyError(code, 'native text'))
    const error = await createPasskey(creation).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(PasskeyError)
    expect(error).toMatchObject({ code })
    expect((error as Error).message).toContain('native text')
  })

  it('rejects anything else as failed', async () => {
    native.create.mockRejectedValue(new Error('boom'))
    await expect(createPasskey(creation)).rejects.toMatchObject({
      code: 'failed',
    })
  })
})

describe('getPasskey', () => {
  it('sends the salt and returns the PRF output apart from the response', async () => {
    native.get.mockResolvedValue(assertion({ results: { first: toB64u(PRF) } }))
    const { response, prf } = await getPasskey(request)
    expect(sentOptions(native.get)).toEqual({
      ...request,
      extensions: { prf: { eval: { first: toB64u(SALT) } } },
    })
    expect(prf).toEqual(PRF)
    expect(response.clientExtensionResults).toEqual({})
    expect(response.response.userHandle).toBe('AAEC')
  })

  it('returns null PRF for a passkey that only signs in', async () => {
    native.get.mockResolvedValue(assertion(undefined))
    expect((await getPasskey(request)).prf).toBeNull()
  })

  it('accepts only a 32-byte PRF output', async () => {
    for (const length of [16, 31, 33, 64]) {
      native.get.mockResolvedValue(
        assertion({ results: { first: toB64u(new Uint8Array(length)) } })
      )
      expect((await getPasskey(request)).prf).toBeNull()
    }
  })

  it('maps module errors', async () => {
    native.get.mockRejectedValue(new NativePasskeyError('no_credentials'))
    await expect(getPasskey(request)).rejects.toMatchObject({
      code: 'no_credentials',
    })
  })
})
