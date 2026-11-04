import { randomBytes as nodeRandomBytes } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import type {
  AccountKeyLoss,
  ReplaceAccountKeyResult,
} from '@/lib/accountKey/accountKey'
import { toB64u } from '@/lib/bytes'
import { HttpError } from '@/lib/http/request'
import { PasskeyError, type PasskeyErrorCode } from '@/lib/passkeys/errors'
import { deriveAccountSigningKey } from '@/lib/serverAccount/keys'
import type { PasskeySignIn } from '@/lib/serverAccount/passkeyClient'
import {
  type PasskeyWrap,
  unwrapAccountKey,
  wrapAccountKey,
} from '@/lib/serverAccount/passkeys'
import {
  createPhonePasskeySignIn,
  type PhonePasskeySignInDeps,
  type PhonePasskeySignInEvent,
} from '@/lib/serverAccount/phonePasskeySignIn'
import { AccountSessionError } from '@/lib/serverAccount/session'

vi.mock('@/lib/logger', () => import('@/__tests__/mocks/logger'))

const random = (length: number) => new Uint8Array(nodeRandomBytes(length))
const KEY = random(32)
const OTHER_KEY = random(32)
const PUB = deriveAccountSigningKey(KEY).publicKey
const ACCOUNT = 'acct_aaaaaaaaaaaaaaaaaaaaaa'
const CREDENTIAL = toB64u(random(16))
const PRF = random(32)
const NO_LOSS: AccountKeyLoss = {
  buddies: 0,
  buddyNames: [],
  inboxRegistered: false,
  keptElsewhere: false,
}

const wrapOf = (prf: Uint8Array, keyEpoch = 0): PasskeyWrap => ({
  wrapId: toB64u(random(16)),
  keyEpoch,
  wrap: wrapAccountKey(
    {
      prfOutput: prf,
      accountKey: KEY,
      accountId: ACCOUNT,
      credentialId: CREDENTIAL,
      keyEpoch,
    },
    random(24)
  ),
})

const assertion = (prf: Uint8Array | null, id = CREDENTIAL) => ({
  response: {
    id,
    rawId: id,
    type: 'public-key' as const,
    response: { clientDataJSON: '', authenticatorData: '', signature: '' },
    clientExtensionResults: {},
  },
  prf,
})

/** What `passkeys/assert` answers a phone: no ticket for an Android origin. */
const signedIn = (wraps: PasskeyWrap[]): PasskeySignIn => ({
  accountId: ACCOUNT,
  accountPub: PUB,
  status: 'active',
  keyEpoch: 0,
  credentialId: CREDENTIAL,
  userHandle: 'aGFuZGxl',
  wraps,
})

function setup(
  options: {
    wraps?: PasskeyWrap[]
    /** PRF output each get returns; a fresh copy every time. */
    prf?: Uint8Array | null
    current?: Uint8Array | null
    /** The account this phone was last on. */
    lastAccountId?: string | null
    confirm?: boolean
    sessionAccountId?: string
  } = {}
) {
  const events: PhonePasskeySignInEvent[] = []
  const given: Uint8Array[] = []
  const saved: (PasskeyWrap & { credentialId: string })[] = []
  let wraps = options.wraps ?? []
  const session = {
    accountId: options.sessionAccountId ?? ACCOUNT,
    status: 'active' as const,
    sessionId: 'session-1',
    adopt: vi.fn(async () => undefined),
    close: vi.fn(async () => undefined),
  }
  const prf = options.prf === undefined ? PRF : options.prf
  const deps = {
    passkeys: {
      challenge: vi.fn(async () => ({
        challengeToken: 'challenge-token',
        options: { challenge: 'c', rpId: 'app-dev.witnesswork.app' },
      })),
      get: vi.fn(async () => {
        const output = prf ? prf.slice() : null
        if (output) given.push(output)
        return assertion(output)
      }),
      assert: vi.fn(async () => signedIn(wraps)),
    },
    account: {
      openDetached: vi.fn(
        async (_key: Uint8Array, _call: { accountId: string }) => session
      ),
      current: vi.fn(async () => options.current ?? null),
      lastAccountId: () => options.lastAccountId ?? null,
      lossIfReplaced: vi.fn(
        async (_key: Uint8Array, _call: { accountId: string }) => NO_LOSS
      ),
      replace: vi.fn(
        async (
          _key: Uint8Array,
          _session: unknown,
          _accountId: string
        ): Promise<ReplaceAccountKeyResult> => ({
          outcome: 'replaced',
          loss: NO_LOSS,
          accountId: ACCOUNT,
          sameAccount: false,
        })
      ),
    },
    confirmReplace: vi.fn(
      async (_loss: AccountKeyLoss) => options.confirm ?? true
    ),
    wrapServer: vi.fn(() => ({
      account: vi.fn(async () => ({
        accountId: ACCOUNT,
        accountPub: PUB,
        keyEpoch: 0,
      })),
      wrap: vi.fn(async (wrap: PasskeyWrap & { credentialId: string }) => {
        saved.push(wrap)
        // The server keeps it, newest first, for the next sign-in.
        wraps = [wrap, ...wraps]
      }),
    })),
    randomBytes: random,
    isRemovalPending: (error: unknown) =>
      error instanceof Error && error.message === 'removal pending',
    onEvent: (event: PhonePasskeySignInEvent) => events.push(event),
  } satisfies PhonePasskeySignInDeps
  const flow = createPhonePasskeySignIn(deps)
  const zeroed = () => given.every((bytes) => bytes.every((b) => b === 0))
  return { flow, deps, events, given, saved, session, zeroed }
}

describe('signing in with a passkey that unlocks', () => {
  it("adopts the account's key with an attested session of its own", async () => {
    const { flow, deps, events, session, zeroed } = setup({
      wraps: [wrapOf(PRF)],
    })
    await expect(flow.signIn()).resolves.toEqual({
      status: 'unlocked',
      replaced: 'replaced',
      rejoined: false,
    })
    expect(deps.passkeys.assert).toHaveBeenCalledWith({
      challengeToken: 'challenge-token',
      response: expect.objectContaining({ id: CREDENTIAL }),
    })
    // Only into the passkey's account, never another or a new one.
    expect(deps.account.openDetached).toHaveBeenCalledWith(KEY, {
      accountId: ACCOUNT,
    })
    expect(deps.account.replace).toHaveBeenCalledWith(KEY, session, ACCOUNT)
    expect(session.close).toHaveBeenCalled()
    expect(deps.confirmReplace).not.toHaveBeenCalled()
    expect(flow.pending()).toBeNull()
    expect(zeroed()).toBe(true)
    expect(events).toEqual([
      { type: 'started' },
      { type: 'succeeded', unlocked: true },
    ])
  })

  it('tries every wrap and keeps the one that opens', async () => {
    const { flow } = setup({ wraps: [wrapOf(random(32)), wrapOf(PRF)] })
    await expect(flow.signIn()).resolves.toMatchObject({ status: 'unlocked' })
  })

  it("refuses a session that opens another account than the passkey's", async () => {
    const { flow, deps, session, events } = setup({
      wraps: [wrapOf(PRF)],
      sessionAccountId: 'acct_bbbbbbbbbbbbbbbbbbbbbb',
    })
    await expect(flow.signIn()).resolves.toMatchObject({
      status: 'failed',
      reason: 'mismatch',
    })
    expect(session.close).toHaveBeenCalled()
    expect(deps.account.replace).not.toHaveBeenCalled()
    expect(events.at(-1)).toEqual({ type: 'failed', reason: 'mismatch' })
  })

  it('refuses an assertion of another credential than the server verified', async () => {
    const { flow, deps, zeroed } = setup({ wraps: [wrapOf(PRF)] })
    deps.passkeys.get.mockImplementationOnce(async () => {
      const output = PRF.slice()
      return { ...assertion(output, toB64u(random(16))), prf: output }
    })
    const result = await flow.signIn()
    expect(result).toMatchObject({ status: 'failed', reason: 'credential' })
    expect(deps.account.openDetached).not.toHaveBeenCalled()
    expect(zeroed()).toBe(true)
  })

  it('reports a replace that failed, and whether Delete Buddies still waits', async () => {
    const { flow, deps, session } = setup({ wraps: [wrapOf(PRF)] })
    deps.account.replace.mockRejectedValueOnce(new Error('removal pending'))
    await expect(flow.signIn()).resolves.toMatchObject({
      status: 'failed',
      reason: 'replace_failed',
      removalPending: true,
    })
    expect(session.close).toHaveBeenCalled()
  })
})

describe('the replace-key warning', () => {
  it('asks before replacing a different key, and stops on Cancel', async () => {
    const { flow, deps, session, events } = setup({
      wraps: [wrapOf(PRF)],
      current: OTHER_KEY,
      confirm: false,
    })
    await expect(flow.signIn()).resolves.toEqual({ status: 'declined' })
    expect(deps.confirmReplace).toHaveBeenCalledWith(NO_LOSS)
    expect(deps.account.lossIfReplaced).toHaveBeenCalledWith(KEY, {
      accountId: ACCOUNT,
    })
    expect(deps.account.replace).not.toHaveBeenCalled()
    expect(session.close).toHaveBeenCalled()
    expect(events.at(-1)).toEqual({ type: 'failed', reason: 'declined' })
  })

  it('goes ahead once the User confirms', async () => {
    const { flow, deps } = setup({
      wraps: [wrapOf(PRF)],
      current: OTHER_KEY,
    })
    await expect(flow.signIn()).resolves.toMatchObject({ status: 'unlocked' })
    expect(deps.confirmReplace).toHaveBeenCalled()
    expect(deps.account.replace).toHaveBeenCalled()
  })

  // A shared password manager (Google Password Manager's family sharing,
  // iCloud Keychain) can offer someone else's passkey: on both platforms,
  // another account's key never replaces this phone's unasked, even when it
  // loses nothing.
  it('asks even when replacing loses nothing', async () => {
    const { flow, deps } = setup({
      wraps: [wrapOf(PRF)],
      current: OTHER_KEY,
      confirm: false,
    })
    await expect(flow.signIn()).resolves.toEqual({ status: 'declined' })
    expect(deps.confirmReplace).toHaveBeenCalledWith(NO_LOSS)
    expect(deps.account.replace).not.toHaveBeenCalled()
  })

  it("doesn't ask when this phone already has the passkey's key", async () => {
    const { flow, deps } = setup({
      wraps: [wrapOf(PRF)],
      current: KEY.slice(),
    })
    deps.account.replace.mockResolvedValueOnce({ outcome: 'unchanged' })
    await expect(flow.signIn()).resolves.toEqual({
      status: 'unlocked',
      replaced: 'unchanged',
      rejoined: false,
    })
    expect(deps.confirmReplace).not.toHaveBeenCalled()
  })

  it("doesn't ask on a phone with no key yet", async () => {
    const { flow, deps } = setup({ wraps: [wrapOf(PRF)], current: null })
    await expect(flow.signIn()).resolves.toMatchObject({ status: 'unlocked' })
    expect(deps.confirmReplace).not.toHaveBeenCalled()
  })

  it('rejoins the account this phone was on, under its changed key, without asking', async () => {
    const { flow, deps, session } = setup({
      wraps: [wrapOf(PRF)],
      current: OTHER_KEY,
      lastAccountId: ACCOUNT,
    })
    deps.account.replace.mockResolvedValueOnce({
      outcome: 'replaced',
      loss: NO_LOSS,
      accountId: ACCOUNT,
      sameAccount: true,
    })
    await expect(flow.signIn()).resolves.toEqual({
      status: 'unlocked',
      replaced: 'replaced',
      rejoined: true,
    })
    expect(deps.confirmReplace).not.toHaveBeenCalled()
    expect(deps.account.replace).toHaveBeenCalledWith(KEY, session, ACCOUNT)
  })
})

describe('a passkey that signs in but can’t unlock', () => {
  it('keeps it in memory, then saves a wrap once the key arrives, and unlocks next time', async () => {
    const { flow, deps, events, saved, given } = setup({ wraps: [] })
    await expect(flow.signIn()).resolves.toEqual({
      status: 'cantUnlock',
      reason: 'noWraps',
      prf: true,
    })
    expect(deps.account.openDetached).not.toHaveBeenCalled()
    expect(deps.account.replace).not.toHaveBeenCalled()
    expect(flow.pending()).toEqual({ reason: 'noWraps', prf: true })
    // Kept, not zeroed, until the key arrives.
    expect(given[0]).toEqual(PRF)

    // The other phone's QR code or the recovery key brought it.
    await expect(flow.keyArrived(KEY)).resolves.toBe('saved')
    expect(saved).toHaveLength(1)
    expect(saved[0]).toMatchObject({ credentialId: CREDENTIAL, keyEpoch: 0 })
    expect(
      unwrapAccountKey({
        prfOutput: PRF,
        accountId: ACCOUNT,
        credentialId: CREDENTIAL,
        keyEpoch: 0,
        wrap: saved[0].wrap,
      })
    ).toEqual(KEY)
    expect(given[0].every((byte) => byte === 0)).toBe(true)
    expect(flow.pending()).toBeNull()

    await expect(flow.signIn()).resolves.toMatchObject({ status: 'unlocked' })
    expect(events).toEqual([
      { type: 'started' },
      { type: 'succeeded', unlocked: false, reason: 'noWraps', prf: true },
      { type: 'wrap', outcome: 'saved' },
      { type: 'started' },
      { type: 'succeeded', unlocked: true },
    ])
  })

  it('says so when no wrap opens under this PRF output', async () => {
    const { flow } = setup({ wraps: [wrapOf(random(32))] })
    await expect(flow.signIn()).resolves.toEqual({
      status: 'cantUnlock',
      reason: 'noneOpened',
      prf: true,
    })
  })

  it('without PRF output (iOS before 18) saves no wrap', async () => {
    const { flow, deps, events } = setup({ wraps: [wrapOf(PRF)], prf: null })
    await expect(flow.signIn()).resolves.toEqual({
      status: 'cantUnlock',
      reason: 'noPrf',
      prf: false,
    })
    await expect(flow.keyArrived(KEY)).resolves.toBe('no_prf')
    expect(deps.wrapServer).not.toHaveBeenCalled()
    expect(events.at(-1)).toEqual({ type: 'wrap', outcome: 'no_prf' })
  })

  it("saves nothing for a key of another account than the passkey's", async () => {
    const { flow, deps, given } = setup({ wraps: [] })
    await flow.signIn()
    await expect(flow.keyArrived(OTHER_KEY)).resolves.toBe('other_account')
    expect(deps.wrapServer).not.toHaveBeenCalled()
    expect(given[0].every((byte) => byte === 0)).toBe(true)
  })

  it('stays Sign-in only when saving the wrap fails', async () => {
    const { flow, deps, given } = setup({ wraps: [] })
    await flow.signIn()
    deps.wrapServer.mockReturnValueOnce({
      account: vi.fn(async () => ({
        accountId: ACCOUNT,
        accountPub: PUB,
        keyEpoch: 0,
      })),
      wrap: vi.fn(async () => {
        throw new HttpError('offline')
      }),
    })
    await expect(flow.keyArrived(KEY)).resolves.toBe('not_saved')
    expect(given[0].every((byte) => byte === 0)).toBe(true)
    // Once only.
    await expect(flow.keyArrived(KEY)).resolves.toBeNull()
  })

  it('a key that arrives with no passkey waiting does nothing', async () => {
    const { flow, deps, events } = setup()
    await expect(flow.keyArrived(KEY)).resolves.toBeNull()
    expect(deps.wrapServer).not.toHaveBeenCalled()
    expect(events).toEqual([])
  })
})

describe('trying another passkey', () => {
  it('keeps the waiting one when the sheet is closed', async () => {
    const { flow, deps, given } = setup({ wraps: [] })
    await flow.signIn()
    deps.passkeys.get.mockRejectedValueOnce(new PasskeyError('cancelled'))
    await expect(flow.signIn()).resolves.toEqual({ status: 'cancelled' })
    expect(flow.pending()).toEqual({ reason: 'noWraps', prf: true })
    // Still there to save a wrap with once the key arrives.
    expect(given[0]).toEqual(PRF)
    await expect(flow.keyArrived(KEY)).resolves.toBe('saved')
  })

  it('keeps the waiting one when the new try fails', async () => {
    const { flow, deps } = setup({ wraps: [] })
    await flow.signIn()
    deps.passkeys.assert.mockRejectedValueOnce(new HttpError('offline'))
    await expect(flow.signIn()).resolves.toMatchObject({
      status: 'failed',
      reason: 'offline',
    })
    expect(flow.pending()).toEqual({ reason: 'noWraps', prf: true })
  })

  it("replaces it with a new one that can't unlock either", async () => {
    const { flow, deps } = setup({ wraps: [] })
    await flow.signIn()
    deps.passkeys.get.mockResolvedValueOnce(assertion(null))
    await expect(flow.signIn()).resolves.toMatchObject({
      status: 'cantUnlock',
      prf: false,
    })
    // The new passkey's, which gave no PRF output.
    expect(flow.pending()).toEqual({ reason: 'noWraps', prf: false })
  })

  it('forgets it once a passkey unlocks, even if the User then declines', async () => {
    const { flow, deps } = setup({
      wraps: [],
      current: OTHER_KEY,
      confirm: false,
    })
    await flow.signIn()
    deps.passkeys.assert.mockResolvedValueOnce(signedIn([wrapOf(PRF)]))
    await expect(flow.signIn()).resolves.toEqual({ status: 'declined' })
    expect(flow.pending()).toBeNull()
  })
})

describe('PRF output is zeroed', () => {
  it('when the User leaves without the key', async () => {
    const { flow, given } = setup({ wraps: [] })
    await flow.signIn()
    flow.forget()
    expect(flow.pending()).toBeNull()
    expect(given[0].every((byte) => byte === 0)).toBe(true)
  })

  it("when another passkey that can't unlock replaces the waiting one", async () => {
    const { flow, given } = setup({ wraps: [] })
    await flow.signIn()
    await flow.signIn()
    expect(given[0].every((byte) => byte === 0)).toBe(true)
    expect(given[1]).toEqual(PRF)
  })

  it('when another passkey unlocks in its place', async () => {
    const { flow, given, saved } = setup({ wraps: [] })
    await flow.signIn()
    // Finished elsewhere meanwhile, then tried again.
    await flow.keyArrived(KEY)
    expect(saved).toHaveLength(1)
    await flow.signIn()
    expect(flow.pending()).toBeNull()
    expect(given.every((bytes) => bytes.every((b) => b === 0))).toBe(true)
  })

  it('when the server refuses the assertion', async () => {
    const { flow, deps, zeroed } = setup({ wraps: [wrapOf(PRF)] })
    deps.passkeys.assert.mockRejectedValueOnce(
      new HttpError('client', 403, 'passkey_failed', null, undefined, {
        reason: 'signature',
      })
    )
    await flow.signIn()
    expect(zeroed()).toBe(true)
  })

  it('when opening the session fails', async () => {
    const { flow, deps, zeroed } = setup({ wraps: [wrapOf(PRF)] })
    deps.account.openDetached.mockRejectedValueOnce(
      new AccountSessionError('offline')
    )
    await flow.signIn()
    expect(zeroed()).toBe(true)
  })
})

describe('errors', () => {
  it.each<[PasskeyErrorCode, string]>([
    ['not_supported', 'not_supported'],
    ['no_credentials', 'no_credentials'],
    ['domain_not_associated', 'domain_not_associated'],
    ['timeout', 'timeout'],
    ['failed', 'passkey_failed'],
  ])("the platform's %s is %s", async (code, reason) => {
    const { flow, deps, events } = setup()
    deps.passkeys.get.mockRejectedValueOnce(new PasskeyError(code))
    await expect(flow.signIn()).resolves.toMatchObject({
      status: 'failed',
      reason,
    })
    expect(deps.passkeys.assert).not.toHaveBeenCalled()
    expect(events.at(-1)).toEqual({ type: 'failed', reason })
  })

  it('a closed passkey sheet is a cancel', async () => {
    const { flow, deps, events } = setup()
    deps.passkeys.get.mockRejectedValueOnce(new PasskeyError('cancelled'))
    await expect(flow.signIn()).resolves.toEqual({ status: 'cancelled' })
    expect(events.at(-1)).toEqual({ type: 'failed', reason: 'cancelled' })
  })

  it.each<[string, unknown, Record<string, unknown>]>([
    ['offline', new HttpError('offline'), { reason: 'offline' }],
    [
      'rate_limited, with Retry-After',
      new HttpError('rateLimited', 429, 'rate_limited', 90_000),
      { reason: 'rate_limited', retryAfterMs: 90_000 },
    ],
    [
      'update_required',
      new HttpError('client', 426, 'upgrade_required'),
      { reason: 'update_required' },
    ],
    [
      'unavailable',
      new HttpError('server', 503, 'disabled'),
      { reason: 'unavailable' },
    ],
    [
      'an unknown passkey',
      new HttpError('client', 403, 'passkey_failed', null, undefined, {
        reason: 'unknown_credential',
      }),
      { reason: 'unknown_passkey', serverReason: 'unknown_credential' },
    ],
    [
      'a passkey that failed',
      new HttpError('client', 403, 'passkey_failed', null, undefined, {
        reason: 'signature',
      }),
      { reason: 'passkey_failed', serverReason: 'signature' },
    ],
    ['anything else', new HttpError('server', 500), { reason: 'failed' }],
  ])('assert %s', async (_, error, expected) => {
    const { flow, deps } = setup()
    deps.passkeys.assert.mockRejectedValueOnce(error)
    await expect(flow.signIn()).resolves.toMatchObject({
      status: 'failed',
      ...expected,
    })
  })

  it('the challenge offline', async () => {
    const { flow, deps } = setup()
    deps.passkeys.challenge.mockRejectedValueOnce(new HttpError('offline'))
    await expect(flow.signIn()).resolves.toMatchObject({ reason: 'offline' })
    expect(deps.passkeys.get).not.toHaveBeenCalled()
  })

  it.each<[string, AccountSessionError, Record<string, unknown>]>([
    [
      'unverified',
      new AccountSessionError('attestation', { attestation: 'device' }),
      { reason: 'unverified' },
    ],
    [
      'verify_later',
      new AccountSessionError('attestation', { attestation: 'temporary' }),
      { reason: 'verify_later' },
    ],
    [
      'update_required',
      new AccountSessionError('upgrade'),
      { reason: 'update_required' },
    ],
    [
      'rate_limited',
      new AccountSessionError('rateLimited', { retryAfterMs: 60_000 }),
      { reason: 'rate_limited', retryAfterMs: 60_000 },
    ],
    [
      'unavailable',
      new AccountSessionError('unavailable'),
      { reason: 'unavailable' },
    ],
  ])('opening the session: %s', async (_, error, expected) => {
    const { flow, deps } = setup({ wraps: [wrapOf(PRF)] })
    deps.account.openDetached.mockRejectedValueOnce(error)
    await expect(flow.signIn()).resolves.toMatchObject({
      status: 'failed',
      ...expected,
    })
    expect(deps.account.replace).not.toHaveBeenCalled()
  })

  it('a second tap while one runs does nothing', async () => {
    const { flow, deps } = setup({ wraps: [wrapOf(PRF)] })
    const first = flow.signIn()
    await expect(flow.signIn()).resolves.toEqual({ status: 'cancelled' })
    await expect(first).resolves.toMatchObject({ status: 'unlocked' })
    expect(deps.passkeys.challenge).toHaveBeenCalledTimes(1)
  })
})
