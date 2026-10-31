import { beforeEach, describe, expect, it, vi } from 'vitest'
import { toB64u } from '@/lib/bytes'
import { HttpError } from '@/lib/http/request'
import { deriveAccountSigningKey } from '@/lib/serverAccount/keys'
import { unwrapAccountKey } from '@/lib/serverAccount/passkeys'
import { NativePasskeyError } from '../../../modules/passkeys/errorCodes'

vi.mock('@/lib/logger', () => import('@/__tests__/mocks/logger'))

const native = vi.hoisted(() => ({
  isAvailable: vi.fn(() => true),
  getSupport: vi.fn(),
  create: vi.fn(),
  get: vi.fn(),
}))
vi.mock('../../../modules/passkeys', () => native)

const { createPasskey, getPasskey } = await import('@/lib/passkeys')
const {
  addPasskeyFlow,
  isLastUnlocking,
  letPasskeyUnlockFlow,
  removePasskeyFlow,
} = await import('@/lib/serverAccount/passkeyFlow')
type PasskeyFlowDeps = import('@/lib/serverAccount/passkeyFlow').PasskeyFlowDeps

const ACCOUNT_KEY = new Uint8Array(32).fill(7)
const ACCOUNT_PUB = deriveAccountSigningKey(ACCOUNT_KEY).publicKey
const ACCOUNT_ID = 'A'.repeat(22)
const CREDENTIAL = 'Y3JlZA'
const PRF = new Uint8Array(32).fill(9)
const RP_ID = 'app-dev.witnesswork.app'

const registration = (prf?: unknown) =>
  JSON.stringify({
    id: CREDENTIAL,
    rawId: CREDENTIAL,
    type: 'public-key',
    response: { clientDataJSON: 'e30', attestationObject: 'o2Nm' },
    clientExtensionResults: prf === undefined ? {} : { prf },
  })

const assertion = (first?: Uint8Array) =>
  JSON.stringify({
    id: CREDENTIAL,
    rawId: CREDENTIAL,
    type: 'public-key',
    response: {
      clientDataJSON: 'e30',
      authenticatorData: 'YXV0aA',
      signature: 'c2ln',
      userHandle: 'AAEC',
    },
    clientExtensionResults:
      first === undefined ? {} : { prf: { results: { first: toB64u(first) } } },
  })

const otherAssertion = (first?: Uint8Array) =>
  assertion(first).replaceAll(CREDENTIAL, 'b3RoZXI')

const nativeError = (code: NativePasskeyError['code']) =>
  new NativePasskeyError(code, 'native says no')

function setup(overrides: Partial<PasskeyFlowDeps> = {}) {
  let epoch = 0
  const server = {
    registrationOptions: vi.fn(async () => ({
      challengeToken: 'token',
      userHandle: 'AAEC',
      options: {
        challenge: 'Y2hhbGxlbmdl',
        rp: { id: RP_ID, name: 'WitnessWork' },
        user: { id: 'AAEC', name: 'WitnessWork KVW7' },
      },
    })),
    add: vi.fn(async () => ({ credentialId: CREDENTIAL })),
    wrap: vi.fn(async () => {}),
    remove: vi.fn(async () => {}),
    account: vi.fn(async () => ({
      accountId: ACCOUNT_ID,
      accountPub: ACCOUNT_PUB,
      keyEpoch: epoch,
    })),
  }
  const deps: PasskeyFlowDeps = {
    server,
    ceremonies: { create: createPasskey, get: getPasskey },
    confirmOwner: vi.fn(async () => 'confirmed' as const),
    accountKey: ACCOUNT_KEY,
    rpId: RP_ID,
    randomBytes: (length) => new Uint8Array(length).fill(1),
    label: () => 'sealed-label',
    ...overrides,
  }
  return { deps, server, setEpoch: (next: number) => (epoch = next) }
}

beforeEach(() => {
  vi.clearAllMocks()
  native.isAvailable.mockReturnValue(true)
})

describe('addPasskeyFlow', () => {
  it('on the web, unlocks on the RP ID the server registered it for', async () => {
    // The web sends none: the server picks it from the page's origin.
    const { deps, server } = setup({ rpId: undefined })
    server.registrationOptions.mockResolvedValueOnce({
      challengeToken: 'token',
      userHandle: 'AAEC',
      options: {
        challenge: 'Y2hhbGxlbmdl',
        rp: { id: 'app.witnesswork.app', name: 'WitnessWork' },
        user: { id: 'AAEC', name: 'WitnessWork KVW7' },
      },
    })
    native.create.mockResolvedValue(registration({ enabled: true }))
    native.get.mockResolvedValue(assertion(PRF))

    expect(await addPasskeyFlow(deps)).toMatchObject({ canUnlock: true })
    const request = JSON.parse(native.get.mock.calls[0][0] as string)
    expect(request.rpId).toBe('app.witnesswork.app')
  })

  it('adds the passkey at once, then wraps the key with the PRF output', async () => {
    const { deps, server } = setup()
    native.create.mockResolvedValue(registration({ enabled: true }))
    native.get.mockResolvedValue(assertion(PRF))

    expect(await addPasskeyFlow(deps)).toEqual({
      status: 'added',
      credentialId: CREDENTIAL,
      canUnlock: true,
    })
    expect(deps.confirmOwner).toHaveBeenCalledBefore(server.registrationOptions)
    // Added without a wrap, and without PRF output.
    expect(server.add).toHaveBeenCalledWith({
      challengeToken: 'token',
      response: expect.objectContaining({ clientExtensionResults: {} }),
      label: 'sealed-label',
    })
    expect(server.add).toHaveBeenCalledBefore(native.get)
    // The confirming sign-in is for the new credential, with its own challenge.
    const request = JSON.parse(native.get.mock.calls[0][0] as string)
    expect(request).toMatchObject({
      rpId: RP_ID,
      allowCredentials: [{ id: CREDENTIAL, type: 'public-key' }],
      userVerification: 'required',
    })
    expect(request.challenge).not.toBe('Y2hhbGxlbmdl')
    const [saved] = server.wrap.mock.calls[0] as unknown as [
      { wrap: string; keyEpoch: number; credentialId: string },
    ]
    expect(saved).toMatchObject({ credentialId: CREDENTIAL, keyEpoch: 0 })
    expect(
      unwrapAccountKey({
        prfOutput: PRF,
        accountId: ACCOUNT_ID,
        credentialId: CREDENTIAL,
        keyEpoch: 0,
        wrap: saved.wrap,
      })
    ).toEqual(ACCOUNT_KEY)
  })

  it('stays Sign-in only when create says PRF is off, with no sign-in', async () => {
    const { deps, server } = setup()
    native.create.mockResolvedValue(registration({ enabled: false }))
    expect(await addPasskeyFlow(deps)).toEqual({
      status: 'added',
      credentialId: CREDENTIAL,
      canUnlock: false,
      signInOnly: 'no_prf',
    })
    expect(native.get).not.toHaveBeenCalled()
    expect(server.wrap).not.toHaveBeenCalled()
  })

  it('skips the sign-in where the platform has no PRF (before iOS 18)', async () => {
    const { deps } = setup()
    native.create.mockResolvedValue(registration())
    expect(
      await addPasskeyFlow(deps, { support: { passkeys: true, prf: 'no' } })
    ).toMatchObject({ canUnlock: false, signInOnly: 'no_prf' })
    expect(native.get).not.toHaveBeenCalled()
  })

  it('stays Sign-in only when the sign-in brings no PRF output', async () => {
    const { deps, server } = setup()
    native.create.mockResolvedValue(registration())
    native.get.mockResolvedValue(assertion())
    expect(await addPasskeyFlow(deps)).toMatchObject({
      status: 'added',
      canUnlock: false,
      signInOnly: 'no_prf',
    })
    expect(server.wrap).not.toHaveBeenCalled()
  })

  it('treats PRF output of the wrong length as none', async () => {
    const { deps, server } = setup()
    native.create.mockResolvedValue(registration({ enabled: true }))
    native.get.mockResolvedValue(assertion(new Uint8Array(16).fill(9)))
    expect(await addPasskeyFlow(deps)).toMatchObject({
      canUnlock: false,
      signInOnly: 'no_prf',
    })
    expect(server.wrap).not.toHaveBeenCalled()
  })

  it('reports already_registered from create, before anything is stored', async () => {
    const { deps, server } = setup()
    native.create.mockRejectedValue(nativeError('already_registered'))
    expect(await addPasskeyFlow(deps)).toEqual({
      status: 'failed',
      step: 'create',
      reason: 'already_registered',
    })
    expect(server.add).not.toHaveBeenCalled()
  })

  it.each(['domain_not_associated', 'not_supported', 'timeout'] as const)(
    'reports %s from create',
    async (code) => {
      const { deps } = setup()
      native.create.mockRejectedValue(nativeError(code))
      expect(await addPasskeyFlow(deps)).toEqual({
        status: 'failed',
        step: 'create',
        reason: code,
      })
    }
  )

  it('reports not_supported without asking when passkeys are off here', async () => {
    const { deps } = setup()
    expect(
      await addPasskeyFlow(deps, { support: { passkeys: false, prf: 'no' } })
    ).toMatchObject({ status: 'failed', reason: 'not_supported' })
    expect(deps.confirmOwner).not.toHaveBeenCalled()
  })

  describe('cancelling', () => {
    it('at the owner check stops before the server', async () => {
      const { deps, server } = setup({
        confirmOwner: vi.fn(async () => 'cancelled' as const),
      })
      expect(await addPasskeyFlow(deps)).toEqual({
        status: 'cancelled',
        step: 'owner',
      })
      expect(server.registrationOptions).not.toHaveBeenCalled()
    })

    it('at create stores nothing', async () => {
      const { deps, server } = setup()
      native.create.mockRejectedValue(nativeError('cancelled'))
      expect(await addPasskeyFlow(deps)).toEqual({
        status: 'cancelled',
        step: 'create',
      })
      expect(server.add).not.toHaveBeenCalled()
    })

    it('at the confirming sign-in keeps the passkey, Sign-in only', async () => {
      const { deps, server } = setup()
      native.create.mockResolvedValue(registration({ enabled: true }))
      native.get.mockRejectedValue(nativeError('cancelled'))
      expect(await addPasskeyFlow(deps)).toEqual({
        status: 'added',
        credentialId: CREDENTIAL,
        canUnlock: false,
        signInOnly: 'cancelled',
      })
      expect(server.add).toHaveBeenCalled()
      expect(server.wrap).not.toHaveBeenCalled()
    })
  })

  it('fails the owner check when Face ID fails', async () => {
    const { deps } = setup({
      confirmOwner: vi.fn(async () => 'failed' as const),
    })
    expect(await addPasskeyFlow(deps)).toEqual({
      status: 'failed',
      step: 'owner',
      reason: 'owner_failed',
    })
  })

  it('goes ahead on a device with no screen lock', async () => {
    const { deps } = setup({
      confirmOwner: vi.fn(async () => 'noLock' as const),
    })
    native.create.mockRejectedValue(nativeError('not_supported'))
    expect(await addPasskeyFlow(deps)).toMatchObject({
      step: 'create',
      reason: 'not_supported',
    })
  })

  it('refuses an 11th passkey before the password manager saves it', async () => {
    const { deps } = setup()
    expect(await addPasskeyFlow(deps, { count: 10 })).toEqual({
      status: 'failed',
      step: 'options',
      reason: 'limit',
    })
    expect(native.create).not.toHaveBeenCalled()
  })

  it("reports the server's limit and offline", async () => {
    const { deps, server } = setup()
    native.create.mockResolvedValue(registration({ enabled: true }))
    server.add.mockRejectedValueOnce(new HttpError('rateLimited', 429, 'limit'))
    expect(await addPasskeyFlow(deps)).toEqual({
      status: 'failed',
      step: 'save',
      reason: 'limit',
    })
    server.registrationOptions.mockRejectedValueOnce(new HttpError('offline'))
    expect(await addPasskeyFlow(deps)).toEqual({
      status: 'failed',
      step: 'options',
      reason: 'offline',
    })
  })

  it('retries the wrap at the new key epoch after a conflict', async () => {
    const { deps, server, setEpoch } = setup()
    native.create.mockResolvedValue(registration({ enabled: true }))
    native.get.mockResolvedValue(assertion(PRF))
    server.wrap.mockImplementationOnce(async () => {
      setEpoch(1)
      throw new HttpError('client', 409, 'conflict')
    })
    expect(await addPasskeyFlow(deps)).toMatchObject({ canUnlock: true })
    expect(server.wrap).toHaveBeenCalledTimes(2)
    const second = server.wrap.mock.calls[1] as unknown as [
      { keyEpoch: number; wrap: string },
    ]
    expect(second[0].keyEpoch).toBe(1)
    expect(
      unwrapAccountKey({
        prfOutput: PRF,
        accountId: ACCOUNT_ID,
        credentialId: CREDENTIAL,
        keyEpoch: 1,
        wrap: second[0].wrap,
      })
    ).toEqual(ACCOUNT_KEY)
  })

  it('stays Sign-in only when the account key changed meanwhile', async () => {
    const { deps, server } = setup()
    native.create.mockResolvedValue(registration({ enabled: true }))
    native.get.mockResolvedValue(assertion(PRF))
    server.wrap.mockRejectedValueOnce(new HttpError('client', 409, 'conflict'))
    server.account
      .mockResolvedValueOnce({
        accountId: ACCOUNT_ID,
        accountPub: ACCOUNT_PUB,
        keyEpoch: 0,
      })
      .mockResolvedValueOnce({
        accountId: ACCOUNT_ID,
        accountPub: deriveAccountSigningKey(new Uint8Array(32).fill(8))
          .publicKey,
        keyEpoch: 1,
      })
    expect(await addPasskeyFlow(deps)).toMatchObject({
      canUnlock: false,
      signInOnly: 'key_changed',
    })
    expect(server.wrap).toHaveBeenCalledTimes(1)
  })

  it('gives up on a conflict that repeats at the same epoch', async () => {
    const { deps, server } = setup()
    native.create.mockResolvedValue(registration({ enabled: true }))
    native.get.mockResolvedValue(assertion(PRF))
    server.wrap.mockRejectedValue(new HttpError('client', 409, 'conflict'))
    expect(await addPasskeyFlow(deps)).toMatchObject({
      canUnlock: false,
      signInOnly: 'not_saved',
    })
    expect(server.wrap).toHaveBeenCalledTimes(1)
  })

  it('fails when the server stored a credential other than the one created', async () => {
    const { deps, server } = setup()
    native.create.mockResolvedValue(registration({ enabled: true }))
    server.add.mockResolvedValue({ credentialId: 'b3RoZXI' })
    expect(await addPasskeyFlow(deps)).toEqual({
      status: 'failed',
      step: 'save',
      reason: 'failed',
    })
    expect(native.get).not.toHaveBeenCalled()
    expect(server.wrap).not.toHaveBeenCalled()
  })

  it('keeps it Sign-in only when the wrap does not get through', async () => {
    const { deps, server } = setup()
    native.create.mockResolvedValue(registration({ enabled: true }))
    native.get.mockResolvedValue(assertion(PRF))
    server.wrap.mockRejectedValue(new HttpError('offline'))
    expect(await addPasskeyFlow(deps)).toMatchObject({
      status: 'added',
      canUnlock: false,
      signInOnly: 'not_saved',
    })
  })
})

describe('letPasskeyUnlockFlow', () => {
  it('signs in with that passkey and saves a wrap', async () => {
    const { deps, server } = setup()
    native.get.mockResolvedValue(assertion(PRF))
    expect(await letPasskeyUnlockFlow(deps, CREDENTIAL)).toEqual({
      status: 'unlocks',
    })
    expect(JSON.parse(native.get.mock.calls[0][0] as string)).toMatchObject({
      allowCredentials: [{ id: CREDENTIAL }],
    })
    expect(server.wrap).toHaveBeenCalledOnce()
    // The passkey's own user verification is the check.
    expect(deps.confirmOwner).not.toHaveBeenCalled()
  })

  it('is silent when the User cancels', async () => {
    const { deps } = setup()
    native.get.mockRejectedValue(nativeError('cancelled'))
    expect(await letPasskeyUnlockFlow(deps, CREDENTIAL)).toEqual({
      status: 'cancelled',
      step: 'get',
    })
  })

  it('says when there is still no PRF output', async () => {
    const { deps } = setup()
    native.get.mockResolvedValue(assertion(new Uint8Array(31)))
    expect(await letPasskeyUnlockFlow(deps, CREDENTIAL)).toEqual({
      status: 'signInOnly',
      signInOnly: 'no_prf',
    })
  })

  it('saves no wrap when another passkey answered the sign-in', async () => {
    const { deps, server } = setup()
    native.get.mockResolvedValue(otherAssertion(PRF))
    expect(await letPasskeyUnlockFlow(deps, CREDENTIAL)).toEqual({
      status: 'failed',
      step: 'get',
      reason: 'failed',
    })
    expect(server.wrap).not.toHaveBeenCalled()
  })

  it('never throws on PRF output of the wrong length from any ceremony', async () => {
    const { deps, server } = setup({
      ceremonies: {
        create: createPasskey,
        get: async () => ({
          response: JSON.parse(assertion()),
          prf: new Uint8Array(31),
        }),
      },
    })
    expect(await letPasskeyUnlockFlow(deps, CREDENTIAL)).toEqual({
      status: 'signInOnly',
      signInOnly: 'no_prf',
    })
    expect(server.wrap).not.toHaveBeenCalled()
  })

  it.each(['domain_not_associated', 'no_credentials'] as const)(
    'reports %s',
    async (code) => {
      const { deps } = setup()
      native.get.mockRejectedValue(nativeError(code))
      expect(await letPasskeyUnlockFlow(deps, CREDENTIAL)).toEqual({
        status: 'failed',
        step: 'get',
        reason: code,
      })
    }
  )
})

describe('removePasskeyFlow', () => {
  it('checks the owner, then removes', async () => {
    const { deps, server } = setup()
    expect(await removePasskeyFlow(deps, CREDENTIAL)).toEqual({
      status: 'removed',
    })
    expect(deps.confirmOwner).toHaveBeenCalledBefore(server.remove)
    expect(server.remove).toHaveBeenCalledWith(CREDENTIAL)
  })

  it('removes nothing when the owner check is cancelled or fails', async () => {
    for (const check of ['cancelled', 'failed'] as const) {
      const { deps, server } = setup({ confirmOwner: async () => check })
      expect(await removePasskeyFlow(deps, CREDENTIAL)).toEqual(
        check === 'cancelled'
          ? { status: 'cancelled' }
          : { status: 'failed', reason: 'owner_failed' }
      )
      expect(server.remove).not.toHaveBeenCalled()
    }
  })

  it('reports offline, as the remove step', async () => {
    const onError = vi.fn()
    const { deps, server } = setup({ onError })
    server.remove.mockRejectedValue(new HttpError('offline'))
    expect(await removePasskeyFlow(deps, CREDENTIAL)).toEqual({
      status: 'failed',
      reason: 'offline',
    })
    expect(onError).toHaveBeenCalledWith('remove', expect.any(HttpError))
  })
})

describe('isLastUnlocking', () => {
  const list = [
    { credentialId: 'a', canUnlock: true },
    { credentialId: 'b', canUnlock: false },
  ]

  it('is true only for the one passkey left that can unlock', () => {
    expect(isLastUnlocking(list, 'a')).toBe(true)
    expect(isLastUnlocking(list, 'b')).toBe(false)
    expect(
      isLastUnlocking([...list, { credentialId: 'c', canUnlock: true }], 'a')
    ).toBe(false)
  })
})
