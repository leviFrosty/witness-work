import { randomBytes as nodeRandomBytes } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { sameBytes, toB64u } from '@/lib/bytes'
import { encodeRecoveryKey } from '@/lib/accountKey/recoveryKey'
import { HttpError } from '@/lib/http/request'
import { PasskeyError } from '@/lib/passkeys/errors'
import type { CreatedPasskey, PasskeyAssertion } from '@/lib/passkeys/types'
import { deriveAccountSigningKey } from '@/lib/serverAccount/keys'
import type { PasskeySignIn } from '@/lib/serverAccount/passkeyClient'
import { passkeyName, unwrapAccountKey } from '@/lib/serverAccount/passkeys'
import type { OpenedSession } from '@/lib/serverAccount/sessionClient'
import type { WebAccountState } from '@/lib/serverAccount/webAccount'
import { WebSignInError } from '@/lib/serverAccount/webAccount'
import {
  createSignUpKeyGuard,
  createWebSignUp,
  signUpCreationOptions,
  WebSignUpMarkUnreadable,
  type WebSignUpDeps,
  type WebSignUpEvent,
  type WebSignUpMark,
  type WebSignUpRequest,
} from '@/lib/serverAccount/webSignUp'

vi.mock('@/lib/logger', () => import('@/__tests__/mocks/logger'))

const random = (length: number) => new Uint8Array(nodeRandomBytes(length))
const ACCOUNT = 'acct_aaaaaaaaaaaaaaaaaaaaaa'
const OTHER_ACCOUNT = 'acct_bbbbbbbbbbbbbbbbbbbbbb'
const HANDLE = toB64u(random(32))
const CREDENTIAL = toB64u(random(16))
const OTHER_CREDENTIAL = toB64u(random(16))
const RP_ID = 'app-dev.witnesswork.app'
const PRF = random(32)
const CHALLENGE = toB64u(random(32))

const creationOptions = (
  name = passkeyName(HANDLE),
  extra: Record<string, unknown> = {}
) => ({
  challenge: CHALLENGE,
  rp: { id: RP_ID, name: 'WitnessWork' },
  user: { id: HANDLE, name, displayName: name },
  pubKeyCredParams: [
    { type: 'public-key', alg: -8 },
    { type: 'public-key', alg: -7 },
    { type: 'public-key', alg: -257 },
  ],
  timeout: 300_000,
  excludeCredentials: [],
  authenticatorSelection: {
    residentKey: 'required',
    userVerification: 'required',
  },
  attestation: 'none',
  ...extra,
})

/** What the browser is asked to create, whatever the server sent. */
const builtOptions = () => ({
  challenge: CHALLENGE,
  rp: { id: RP_ID, name: 'WitnessWork' },
  user: {
    id: HANDLE,
    name: passkeyName(HANDLE),
    displayName: passkeyName(HANDLE),
  },
  pubKeyCredParams: [
    { type: 'public-key', alg: -8 },
    { type: 'public-key', alg: -7 },
    { type: 'public-key', alg: -257 },
  ],
  timeout: 300_000,
  excludeCredentials: [],
  authenticatorSelection: {
    residentKey: 'required',
    requireResidentKey: true,
    userVerification: 'required',
  },
  attestation: 'none',
})

const made = (prf: CreatedPasskey['prf']): CreatedPasskey => ({
  response: {
    id: CREDENTIAL,
    rawId: CREDENTIAL,
    type: 'public-key',
    response: { clientDataJSON: '', attestationObject: '', transports: [] },
    clientExtensionResults: {},
  },
  prf,
})

const assertion = (
  prf: Uint8Array | null,
  credentialId = CREDENTIAL
): PasskeyAssertion => ({
  response: {
    id: credentialId,
    rawId: credentialId,
    type: 'public-key',
    response: { clientDataJSON: '', authenticatorData: '', signature: '' },
    clientExtensionResults: {},
  },
  prf,
})

const opened = (accountId = ACCOUNT): OpenedSession => ({
  sessionId: 'sess',
  accountId,
  accessToken: 'access',
  accessExpiresAt: 1,
  refreshToken: 'refresh',
  sessionExpiresAt: 2,
  status: 'active',
})

const failure = (
  status: number,
  code: string,
  extra: { retryAfterMs?: number; reason?: string } = {}
) =>
  new HttpError(
    status === 429 ? 'rateLimited' : 'server',
    status,
    code,
    extra.retryAfterMs ?? null,
    undefined,
    extra.reason ? { reason: extra.reason } : null
  )

const pubOf = (key: Uint8Array) => deriveAccountSigningKey(key).publicKey

/** One browser's storage, shared by its tabs and across reloads. */
type Storage = {
  key: Uint8Array | null
  mark: WebSignUpMark | null | 'unreadable'
  /** The data owner record; `unreadable` throws. */
  owner: string | null | 'unreadable'
  /** The `ww-signup` Web Lock, held by a tab. */
  locked: boolean
}

type Options = {
  account?: WebAccountState
  /** The browser's PRF output at the confirming get; null for none. */
  prf?: Uint8Array | null
  created?: () => Promise<CreatedPasskey>
  get?: WebSignUpDeps['ceremonies']['get']
  options?: WebSignUpDeps['server']['options']
  signup?: WebSignUpDeps['server']['signup']
  assert?: WebSignUpDeps['server']['assert']
  adopt?: WebSignUpDeps['account']['adoptSignupSession']
  needsReload?: boolean
  online?: boolean
  /** What an earlier page (or another tab) left. */
  stored?: Partial<Storage>
}

/**
 * One tab of the browser; `reload()` makes the next page on the same storage,
 * and `tab()` another tab beside it.
 */
function setup(options: Options = {}, shared?: Storage) {
  const storage: Storage = shared ?? {
    key: null,
    mark: null,
    owner: null,
    locked: false,
    ...options.stored,
  }
  const prfOutputs: Uint8Array[] = []
  const firsts: Uint8Array[] = []
  const requests: WebSignUpRequest[] = []
  const events: WebSignUpEvent[] = []
  const marks: (WebSignUpMark | null)[] = []
  let made_ = 0
  const deps = {
    account: {
      state: vi.fn(
        (): WebAccountState =>
          options.account ?? {
            status: 'signedOut',
            ended: null,
            keptData: false,
          }
      ),
      adoptSignupSession: vi.fn(
        options.adopt ??
          (async (_key: Uint8Array, session: OpenedSession) => ({
            accountId: session.accountId,
            sessionId: session.sessionId,
            reload: false,
          }))
      ),
      openWebSessionWithTicket: vi.fn(async () => ({
        accountId: ACCOUNT,
        sessionId: 'sess-2',
        reload: false,
      })),
    },
    owner: {
      read: vi.fn(async () => {
        if (storage.owner === 'unreadable') throw new Error('unreadable')
        return storage.owner
      }),
    },
    accountKey: {
      create: vi.fn(async () => {
        if (storage.key) throw new Error('This browser already has an account')
        made_ += 1
        storage.key = random(32)
        return storage.key
      }),
      discard: vi.fn(async (key: Uint8Array) => {
        if (storage.key && sameBytes(storage.key, key)) storage.key = null
      }),
      // No `peek`: a tab's memory from launch is stale once another tab
      // signs up (`webAccountKey.test.ts`, "beside another tab").
      readStored: vi.fn(async () => storage.key),
    },
    server: {
      options: vi.fn(
        options.options ??
          (async () => ({
            accountId: ACCOUNT,
            userHandle: HANDLE,
            challengeToken: 'signup-challenge',
            options: creationOptions(),
          }))
      ),
      signup: vi.fn(async (key: Uint8Array, request: WebSignUpRequest) => {
        requests.push(request)
        if (options.signup) return options.signup(key, request)
        return { ...opened(), credentialId: CREDENTIAL }
      }),
      signInChallenge: vi.fn(async () => ({
        challengeToken: 'sign-in-challenge',
        options: {
          challenge: 'sign-in',
          allowCredentials: [],
          // Never passed on: the browser sets these itself.
          rpId: 'elsewhere.example',
          userVerification: 'discouraged',
          extensions: { largeBlob: { read: true } },
          hints: ['security-key'],
        },
      })),
      assert: vi.fn(
        options.assert ??
          (async (): Promise<PasskeySignIn> => ({
            accountId: ACCOUNT,
            accountPub: pubOf(storage.key!),
            status: 'active',
            keyEpoch: 0,
            credentialId: CREDENTIAL,
            userHandle: HANDLE,
            wraps: [],
            ticket: 'passkey-ticket',
            ticketExpiresAt: 3,
          }))
      ),
      closeOpened: vi.fn(async () => undefined),
    },
    ceremonies: {
      create: vi.fn(
        options.created ??
          (async () => {
            const first = random(32)
            firsts.push(first)
            return made({ enabled: true, first })
          })
      ),
      get: vi.fn(
        options.get ??
          (async () => {
            if (options.prf === null) return assertion(null)
            // A copy: the flow zeroes what it's given.
            const prf = (options.prf ?? PRF).slice()
            prfOutputs.push(prf)
            return assertion(prf)
          })
      ),
    },
    signalUnknownPasskey: vi.fn(),
    rpId: () => RP_ID,
    label: vi.fn(() => 'sealed-label'),
    appVersion: () => '1.47.0',
    mark: {
      read: vi.fn(async () => {
        if (storage.mark === 'unreadable') throw new WebSignUpMarkUnreadable()
        return storage.mark
      }),
      write: vi.fn(async (mark: WebSignUpMark | null) => {
        storage.mark = mark
        marks.push(mark)
      }),
    },
    lock: vi.fn(async (run: () => Promise<void>) => {
      if (storage.locked) return false
      storage.locked = true
      try {
        await run()
        return true
      } finally {
        storage.locked = false
      }
    }),
    isOnline: () => options.online ?? true,
    randomBytes: random,
    pageNeedsReload: () => options.needsReload ?? false,
    reload: vi.fn(),
    onEvent: (event: WebSignUpEvent) => events.push(event),
  } satisfies WebSignUpDeps
  const flow = createWebSignUp(deps)
  return {
    flow,
    deps,
    storage,
    events,
    marks,
    requests,
    prfOutputs,
    firsts,
    keysMade: () => made_,
    /** The same browser after a reload. */
    reload: (next: Omit<Options, 'stored'> = {}) =>
      setup({ ...options, ...next }, storage),
    /** Another tab of the same browser. */
    tab: (next: Omit<Options, 'stored'> = {}) => setup(next, storage),
  }
}

const zeroed = (bytes: Uint8Array) => bytes.every((byte) => byte === 0)

/** A sign-up stopped at the passkey prompt, in a tab that holds the lock. */
async function atThePrompt() {
  let resolveCreate: (value: CreatedPasskey) => void = () => {}
  const first = setup({
    created: () =>
      new Promise<CreatedPasskey>((resolve) => (resolveCreate = resolve)),
  })
  const running = first.flow.signUp('token')
  await vi.waitFor(() => expect(first.deps.ceremonies.create).toBeCalled())
  return {
    first,
    finish: async () => {
      resolveCreate(made({ enabled: false, first: null }))
      await running
    },
  }
}

describe('signing up on the web', () => {
  it('makes the key, the passkey and its wrap, then keeps the session', async () => {
    const { flow, deps, storage, events, marks, requests, prfOutputs } = setup()
    await flow.signUp('turnstile-token')

    expect(deps.server.options).toHaveBeenCalledWith('turnstile-token')
    const key = storage.key!
    expect(key).toHaveLength(32)
    expect(deps.ceremonies.create).toHaveBeenCalledWith(builtOptions())
    // PRF is confirmed with a get for the new passkey alone, on its RP ID.
    expect(deps.ceremonies.get).toHaveBeenCalledWith(
      expect.objectContaining({
        rpId: RP_ID,
        allowCredentials: [{ id: CREDENTIAL, type: 'public-key' }],
        userVerification: 'required',
      })
    )
    const [request] = requests
    expect(request).toMatchObject({
      challengeToken: 'signup-challenge',
      label: 'sealed-label',
      device: 'sealed-label',
      appVersion: '1.47.0',
    })
    // One sealed label for the passkey and the session.
    expect(deps.label).toHaveBeenCalledOnce()
    expect(request.response.rawId).toBe(CREDENTIAL)
    expect(deps.server.signup.mock.calls[0][0]).toBe(key)
    // The wrap opens with the passkey's PRF output, bound to the new account,
    // the credential and epoch 0.
    expect(request.wrapId).toEqual(expect.any(String))
    expect(
      unwrapAccountKey({
        prfOutput: PRF,
        accountId: ACCOUNT,
        credentialId: CREDENTIAL,
        keyEpoch: 0,
        wrap: request.wrap!,
      })
    ).toEqual(key)
    expect(deps.account.adoptSignupSession).toHaveBeenCalledWith(key, {
      ...opened(),
      credentialId: CREDENTIAL,
    })
    expect(marks.map((mark) => [mark?.stage, mark?.credentialId])).toEqual([
      ['key', undefined],
      // The passkey, once made: a leftover can be reported unknown.
      ['key', CREDENTIAL],
      ['sent', CREDENTIAL],
      ['created', CREDENTIAL],
    ])
    expect(marks[1]).toMatchObject({ rpId: RP_ID })
    expect(flow.state()).toMatchObject({
      busy: false,
      problem: null,
      finishing: false,
      recoveryKey: { signInOnly: false },
    })
    expect(events).toEqual([
      { type: 'started' },
      { type: 'completed', prf: true, finished: false },
    ])
    // The PRF output is zeroed once the wrap is made.
    expect(prfOutputs.every(zeroed)).toBe(true)
    expect(deps.lock).toHaveBeenCalled()
  })

  it('zeroes PRF output the browser gave at creation', async () => {
    const { flow, firsts } = setup()
    await flow.signUp('token')
    expect(firsts).toHaveLength(1)
    expect(zeroed(firsts[0])).toBe(true)
  })

  describe('the creation options', () => {
    const answer = (options: Record<string, unknown>, userHandle = HANDLE) => ({
      accountId: ACCOUNT,
      userHandle,
      challengeToken: 'c',
      options: options as { challenge: string } & Record<string, unknown>,
    })

    it('asks the browser only for what sign-up needs, whatever else came', () => {
      expect(
        signUpCreationOptions(
          answer(
            creationOptions(undefined, {
              attestation: 'direct',
              authenticatorSelection: {
                residentKey: 'discouraged',
                userVerification: 'discouraged',
              },
              extensions: { largeBlob: { support: 'required' } },
              excludeCredentials: [
                { id: OTHER_CREDENTIAL, type: 'public-key' },
              ],
              hints: ['security-key'],
              pubKeyCredParams: [
                { type: 'public-key', alg: -7 },
                { type: 'public-key', alg: -36 },
              ],
            })
          ),
          RP_ID
        )
      ).toEqual({
        ok: true,
        options: {
          ...builtOptions(),
          pubKeyCredParams: [{ type: 'public-key', alg: -7 }],
        },
      })
    })

    it.each([
      [
        'a user handle that isn’t 32 bytes',
        answer(creationOptions(), toB64u(random(16))),
      ],
      [
        'another user id',
        answer(
          creationOptions(undefined, {
            user: {
              id: toB64u(random(32)),
              name: passkeyName(HANDLE),
              displayName: passkeyName(HANDLE),
            },
          })
        ),
      ],
      ['another name', answer(creationOptions('Someone Else'))],
      [
        'another RP',
        answer(
          creationOptions(undefined, {
            rp: { id: 'example.com', name: 'WitnessWork' },
          })
        ),
      ],
      [
        'no algorithm it knows',
        answer(
          creationOptions(undefined, {
            pubKeyCredParams: [{ type: 'public-key', alg: -36 }],
          })
        ),
      ],
      ['no challenge', answer(creationOptions(undefined, { challenge: '' }))],
    ])('refuses %s', (_, options) => {
      expect(signUpCreationOptions(options, RP_ID)).toEqual({ ok: false })
    })

    it('makes no key when the options are refused', async () => {
      const { flow, deps, storage, events } = setup({
        options: async () => answer(creationOptions('Someone Else')),
      })
      await flow.signUp('token')
      expect(deps.ceremonies.create).not.toHaveBeenCalled()
      expect(storage.key).toBeNull()
      expect(flow.state().problem?.failure).toBe('failed')
      expect(events.at(-1)).toEqual({
        type: 'failed',
        step: 'options',
        reason: 'options',
      })
    })
  })

  describe('what this browser already holds', () => {
    it('never signs up while the owner record says it keeps data', async () => {
      // The tab's state is from before the server signed it out, or cached.
      const { flow, deps, storage } = setup({
        stored: { owner: OTHER_ACCOUNT, key: random(32) },
      })
      const key = storage.key
      await flow.signUp('token')
      expect(deps.server.options).not.toHaveBeenCalled()
      expect(storage.key).toBe(key)
      expect(flow.state().problem?.failure).toBe('failed')
    })

    it('never signs up when the owner record can’t be read', async () => {
      const { flow, deps, storage } = setup({
        stored: { owner: 'unreadable', key: random(32) },
      })
      const key = storage.key
      await flow.signUp('token')
      expect(deps.server.options).not.toHaveBeenCalled()
      expect(deps.accountKey.discard).not.toHaveBeenCalled()
      expect(storage.key).toBe(key)
    })

    it('never deletes a key no sign-up mark names', async () => {
      const { flow, deps, storage, events } = setup({
        stored: { key: random(32) },
      })
      const key = storage.key
      await flow.signUp('token')
      expect(storage.key).toBe(key)
      expect(deps.accountKey.discard).not.toHaveBeenCalled()
      expect(deps.server.options).not.toHaveBeenCalled()
      expect(events.at(-1)).toMatchObject({ reason: 'keyPresent' })
    })

    it('never deletes a key another sign-up’s mark doesn’t name', async () => {
      const { flow, storage } = setup({
        stored: {
          key: random(32),
          mark: {
            accountId: ACCOUNT,
            accountPub: pubOf(random(32)),
            stage: 'key',
          },
        },
      })
      const key = storage.key
      await flow.signUp('token')
      expect(storage.key).toBe(key)
      expect(flow.state().problem?.failure).toBe('failed')
    })

    it('treats an unreadable mark as an account that may exist', async () => {
      const { flow, deps, storage } = setup({
        stored: { key: random(32), mark: 'unreadable' },
      })
      const key = storage.key
      await flow.signUp('token')
      expect(storage.key).toBe(key)
      expect(deps.server.options).not.toHaveBeenCalled()
      expect(storage.mark).toBe('unreadable')
    })

    it('clears an unreadable mark when there’s no key to lose', async () => {
      const { flow, storage } = setup({ stored: { mark: 'unreadable' } })
      await flow.signUp('token')
      expect(flow.state().recoveryKey).toEqual({ signInOnly: false })
      expect(storage.mark).toMatchObject({ stage: 'created' })
    })

    it('replaces its own leftover key, and reports its passkey unknown', async () => {
      const stale = random(32)
      const { flow, deps, storage } = setup({
        stored: {
          key: stale,
          mark: {
            accountId: OTHER_ACCOUNT,
            accountPub: pubOf(stale),
            stage: 'key',
            credentialId: OTHER_CREDENTIAL,
            rpId: RP_ID,
          },
        },
      })
      await flow.signUp('token')
      expect(deps.accountKey.discard).toHaveBeenCalledWith(stale)
      expect(deps.signalUnknownPasskey).toHaveBeenCalledWith(
        RP_ID,
        OTHER_CREDENTIAL
      )
      expect(flow.state().recoveryKey).not.toBeNull()
      // The new sign-up's key, not the leftover.
      expect(storage.key).not.toEqual(stale)
    })
  })

  describe('without PRF', () => {
    it('signs up Sign-in only when the passkey has no PRF', async () => {
      const { flow, deps, requests, events } = setup({
        created: async () => made({ enabled: false, first: null }),
      })
      await flow.signUp('token')
      expect(deps.ceremonies.get).not.toHaveBeenCalled()
      expect(requests[0].wrap).toBeUndefined()
      expect(requests[0].wrapId).toBeUndefined()
      expect(flow.state().recoveryKey).toEqual({ signInOnly: true })
      expect(events.at(-1)).toEqual({
        type: 'completed',
        prf: false,
        finished: false,
      })
    })

    it('signs up Sign-in only when the get gives no PRF output', async () => {
      const { flow, requests } = setup({
        created: async () => made({ enabled: null, first: null }),
        prf: null,
      })
      await flow.signUp('token')
      expect(requests[0].wrap).toBeUndefined()
      expect(flow.state().recoveryKey).toEqual({ signInOnly: true })
    })

    it('signs up Sign-in only when the User cancels the confirming get', async () => {
      const { flow, requests, storage } = setup({
        get: async () => {
          throw new PasskeyError('cancelled')
        },
      })
      await flow.signUp('token')
      expect(requests[0].wrap).toBeUndefined()
      expect(storage.mark).toMatchObject({ signInOnly: true })
      expect(flow.state().recoveryKey).toEqual({ signInOnly: true })
    })

    it('never wraps with another passkey’s output, and zeroes it', async () => {
      const prf = random(32)
      const { flow, requests } = setup({
        get: async () => assertion(prf, OTHER_CREDENTIAL),
      })
      await flow.signUp('token')
      expect(requests[0].wrap).toBeUndefined()
      expect(zeroed(prf)).toBe(true)
    })
  })

  describe('stopping before the account exists', () => {
    it('deletes the key, and says no passkey was saved, when the prompt is cancelled', async () => {
      const { flow, deps, storage, events } = setup({
        created: async () => {
          throw new PasskeyError('cancelled')
        },
      })
      await flow.signUp('token')
      expect(storage.key).toBeNull()
      expect(storage.mark).toBeNull()
      expect(deps.server.signup).not.toHaveBeenCalled()
      expect(deps.account.adoptSignupSession).not.toHaveBeenCalled()
      expect(flow.state()).toMatchObject({
        busy: false,
        problem: { failure: 'passkeyNotSaved' },
        finishing: false,
        recoveryKey: null,
      })
      expect(events.at(-1)).toEqual({
        type: 'failed',
        step: 'create',
        reason: 'cancelled',
      })
    })

    it('can start again after a cancel', async () => {
      let cancel = true
      const { flow, keysMade, storage } = setup({
        created: async () => {
          if (cancel) throw new PasskeyError('cancelled')
          return made({ enabled: false, first: null })
        },
      })
      await flow.signUp('token')
      cancel = false
      await flow.signUp('token-2')
      expect(keysMade()).toBe(2)
      expect(storage.key).not.toBeNull()
      expect(flow.state().recoveryKey).toEqual({ signInOnly: true })
    })

    it('says when this browser can’t make passkeys', async () => {
      const { flow, storage } = setup({
        created: async () => {
          throw new PasskeyError('not_supported')
        },
      })
      await flow.signUp('token')
      expect(storage.key).toBeNull()
      expect(flow.state().problem?.failure).toBe('notSupported')
    })

    it('says so when the browser fails to make the passkey', async () => {
      const { flow } = setup({
        created: async () => {
          throw new PasskeyError('failed', 'largeBlob')
        },
      })
      await flow.signUp('token')
      expect(flow.state().problem?.failure).toBe('passkeyFailed')
    })

    it.each([
      [
        failure(403, 'turnstile_failed', { reason: 'timeout-or-duplicate' }),
        'turnstileFailed',
        'turnstileFailed:timeout-or-duplicate',
      ],
      [
        failure(429, 'rate_limited', { retryAfterMs: 3_600_000 }),
        'rateLimited',
        'rateLimited',
      ],
      [failure(503, 'disabled'), 'paused', 'paused'],
      [
        failure(503, 'unavailable', { retryAfterMs: 30_000 }),
        'unavailable',
        'unavailable',
      ],
      [new HttpError('offline'), 'unreachable', 'unreachable'],
    ] as const)(
      'makes no key when the options are refused (%s)',
      async (error, shown, reason) => {
        const { flow, deps, events } = setup({
          options: async () => {
            throw error
          },
        })
        await flow.signUp('token')
        expect(deps.accountKey.create).not.toHaveBeenCalled()
        expect(flow.state().problem).toEqual({
          failure: shown,
          retryAfterMs: error.retryAfterMs,
        })
        expect(events.at(-1)).toEqual({
          type: 'failed',
          step: 'options',
          reason,
        })
      }
    )

    it('says offline only when the browser is', async () => {
      const { flow } = setup({
        online: false,
        options: async () => {
          throw new HttpError('offline')
        },
      })
      await flow.signUp('token')
      expect(flow.state().problem?.failure).toBe('offline')
    })

    it.each([
      failure(429, 'rate_limited', { retryAfterMs: 60_000 }),
      failure(503, 'unavailable', { retryAfterMs: 30_000 }),
      failure(503, 'disabled'),
      failure(403, 'passkey_failed', { reason: 'registration' }),
      failure(400, 'bad_request'),
    ])(
      'deletes the key, and forgets the passkey, when web/signup refuses (%s)',
      async (error) => {
        const { flow, storage, deps } = setup({
          signup: async () => {
            throw error
          },
        })
        await flow.signUp('token')
        expect(storage.key).toBeNull()
        expect(storage.mark).toBeNull()
        expect(deps.server.assert).not.toHaveBeenCalled()
        expect(deps.signalUnknownPasskey).toHaveBeenCalledWith(
          RP_ID,
          CREDENTIAL
        )
        expect(flow.state()).toMatchObject({
          finishing: false,
          recoveryKey: null,
        })
        expect(flow.state().problem).not.toBeNull()
      }
    )

    it('deletes a key an earlier page made but never sent, and its passkey', async () => {
      const { first } = await atThePrompt()
      await vi.waitFor(() =>
        expect(first.storage.mark).toMatchObject({ stage: 'key' })
      )
      const stale = first.storage.key!
      // The tab closed at the prompt, which lets go of its lock.
      first.storage.locked = false
      first.storage.mark = {
        ...(first.storage.mark as WebSignUpMark),
        credentialId: OTHER_CREDENTIAL,
        rpId: RP_ID,
      }

      const next = first.reload()
      await next.flow.resume(null)
      expect(next.storage.key).toBeNull()
      expect(next.storage.mark).toBeNull()
      expect(next.deps.accountKey.discard).toHaveBeenCalledWith(stale)
      expect(next.deps.signalUnknownPasskey).toHaveBeenCalledWith(
        RP_ID,
        OTHER_CREDENTIAL
      )
      expect(next.flow.state()).toMatchObject({
        ready: true,
        finishing: false,
      })
    })

    it('leaves a key that isn’t the sign-up’s', async () => {
      const other = random(32)
      const { flow, storage } = setup({
        stored: {
          key: other,
          mark: {
            accountId: ACCOUNT,
            accountPub: pubOf(random(32)),
            stage: 'key',
          },
        },
      })
      await flow.resume(null)
      expect(storage.key).toBe(other)
      expect(storage.mark).toBeNull()
    })
  })

  describe('two tabs', () => {
    it('another tab’s launch leaves a sign-up at its prompt alone', async () => {
      const { first, finish } = await atThePrompt()
      const key = first.storage.key
      const second = first.tab()
      await second.flow.resume(null)
      expect(first.storage.key).toBe(key)
      expect(first.storage.mark).toMatchObject({ stage: 'key' })
      expect(second.flow.state()).toMatchObject({
        ready: true,
        finishing: false,
      })
      await finish()
      expect(first.flow.state().recoveryKey).toEqual({ signInOnly: true })
    })

    it('another tab can’t sign up while one is', async () => {
      const { first, finish } = await atThePrompt()
      const key = first.storage.key
      const second = first.tab()
      await second.flow.signUp('token-2')
      expect(second.deps.server.options).not.toHaveBeenCalled()
      expect(second.flow.state().problem?.failure).toBe('otherTab')
      expect(first.storage.key).toBe(key)
      await finish()
      expect(first.storage.mark).toMatchObject({ stage: 'created' })
    })
  })

  describe('a lost answer', () => {
    it.each([
      ['conflict', failure(409, 'conflict')],
      ['replay', failure(409, 'replay')],
      [
        'a used challenge',
        failure(403, 'passkey_failed', { reason: 'challenge' }),
      ],
    ])('signs in with the passkey just made after %s', async (_, error) => {
      const { flow, deps, storage, events } = setup({
        signup: async () => {
          throw error
        },
      })
      await flow.signUp('token')
      const key = storage.key!
      expect(deps.ceremonies.get).toHaveBeenLastCalledWith(
        expect.objectContaining({
          challenge: 'sign-in',
          allowCredentials: [{ id: CREDENTIAL, type: 'public-key' }],
        })
      )
      expect(deps.account.openWebSessionWithTicket).toHaveBeenCalledWith(
        'passkey-ticket',
        key,
        { expectAccountId: ACCOUNT }
      )
      expect(deps.account.adoptSignupSession).not.toHaveBeenCalled()
      // It ends on the recovery key, as the happy path does.
      expect(flow.state()).toMatchObject({
        busy: false,
        problem: null,
        finishing: false,
        recoveryKey: { signInOnly: false },
      })
      expect(storage.mark).toMatchObject({ stage: 'created' })
      expect(events.at(-1)).toEqual({
        type: 'completed',
        prf: true,
        finished: true,
      })
    })

    it('zeroes the PRF output of the sign-in that finishes', async () => {
      const outputs: Uint8Array[] = []
      const { flow } = setup({
        created: async () => made({ enabled: false, first: null }),
        get: async () => {
          const prf = random(32)
          outputs.push(prf)
          return assertion(prf)
        },
        signup: async () => {
          throw failure(409, 'conflict')
        },
      })
      await flow.signUp('token')
      expect(outputs).toHaveLength(1)
      expect(zeroed(outputs[0])).toBe(true)
      // The browser holds the key: a Sign-in-only passkey finishes too.
      expect(flow.state().recoveryKey).toEqual({ signInOnly: true })
    })

    it('refuses a passkey of another account, and keeps the key', async () => {
      const { flow, deps, storage } = setup({
        signup: async () => {
          throw failure(409, 'conflict')
        },
        assert: async () => ({
          accountId: OTHER_ACCOUNT,
          accountPub: pubOf(random(32)),
          status: 'active',
          keyEpoch: 0,
          credentialId: CREDENTIAL,
          userHandle: HANDLE,
          wraps: [],
          ticket: 'other-ticket',
          ticketExpiresAt: 3,
        }),
      })
      await flow.signUp('token')
      expect(deps.account.openWebSessionWithTicket).not.toHaveBeenCalled()
      expect(storage.key).not.toBeNull()
      expect(flow.state()).toMatchObject({
        finishing: true,
        problem: { failure: 'wrongPasskey' },
      })
    })

    it('keeps the key when the User cancels the sign-in that finishes', async () => {
      let calls = 0
      const { flow, storage } = setup({
        get: async () => {
          calls += 1
          if (calls === 2) throw new PasskeyError('cancelled')
          return assertion(random(32))
        },
        signup: async () => {
          throw failure(409, 'conflict')
        },
      })
      await flow.signUp('token')
      expect(storage.key).not.toBeNull()
      expect(storage.mark).toMatchObject({ stage: 'sent' })
      // Never silent: it says which passkey finishes.
      expect(flow.state()).toMatchObject({
        finishing: true,
        problem: { failure: 'pickPasskey', passkeyName: passkeyName(HANDLE) },
      })

      await flow.finish()
      expect(flow.state().recoveryKey).toEqual({ signInOnly: false })
    })
  })

  describe('no answer', () => {
    it('keeps the key and sends the same sign-up again', async () => {
      let answer = false
      const { flow, deps, storage, requests } = setup({
        signup: async () => {
          if (!answer) throw new HttpError('timeout')
          return { ...opened(), credentialId: CREDENTIAL }
        },
      })
      await flow.signUp('token')
      expect(storage.key).not.toBeNull()
      expect(storage.mark).toMatchObject({ stage: 'sent' })
      expect(flow.state()).toMatchObject({
        finishing: true,
        problem: { failure: 'unreachable' },
      })

      answer = true
      await flow.finish()
      expect(requests).toHaveLength(2)
      expect(requests[1]).toEqual(requests[0])
      expect(deps.account.adoptSignupSession).toHaveBeenCalledOnce()
      expect(flow.state().recoveryKey).toEqual({ signInOnly: false })
    })

    it('finishes with the passkey when the second answer says it exists', async () => {
      let tries = 0
      const { flow, deps } = setup({
        signup: async () => {
          tries += 1
          throw tries === 1
            ? failure(500, 'internal')
            : failure(403, 'passkey_failed', { reason: 'challenge' })
        },
      })
      await flow.signUp('token')
      expect(flow.state().finishing).toBe(true)
      await flow.finish()
      expect(deps.account.openWebSessionWithTicket).toHaveBeenCalledOnce()
      expect(flow.state().recoveryKey).not.toBeNull()
    })

    it('never says the account wasn’t made when the browser lost its key', async () => {
      const { flow, deps } = setup({
        stored: {
          mark: { accountId: ACCOUNT, accountPub: 'pub', stage: 'sent' },
        },
      })
      await flow.resume(null)
      expect(flow.state().finishing).toBe(true)
      await flow.finish()
      expect(flow.state().problem?.failure).toBe('failed')
      expect(deps.signalUnknownPasskey).not.toHaveBeenCalled()
    })

    it('says the key went missing, for analytics', async () => {
      const { flow, events } = setup({
        stored: {
          mark: { accountId: ACCOUNT, accountPub: 'pub', stage: 'sent' },
        },
      })
      await flow.resume(null)
      await flow.finish()
      expect(events).toContainEqual({
        type: 'failed',
        step: 'finish',
        reason: 'keyMissing',
      })
    })

    it('never deletes the key once an answer went missing', async () => {
      let tries = 0
      const { flow, storage, deps } = setup({
        signup: async () => {
          tries += 1
          throw tries === 1
            ? new HttpError('offline')
            : failure(429, 'rate_limited', { retryAfterMs: 60_000 })
        },
      })
      await flow.signUp('token')
      await flow.finish()
      expect(storage.key).not.toBeNull()
      expect(deps.signalUnknownPasskey).not.toHaveBeenCalled()
      expect(flow.state()).toMatchObject({
        finishing: true,
        problem: { failure: 'rateLimited', retryAfterMs: 60_000 },
      })
    })

    it('offers no way to forget the key while the account may exist', async () => {
      const { flow } = setup({
        signup: async () => {
          throw new HttpError('offline')
        },
      })
      await flow.signUp('token')
      expect(flow.state().finishing).toBe(true)
      expect('startOver' in flow).toBe(false)
    })

    it('finishes after a reload with the passkey, onto the recovery key', async () => {
      const first = setup({
        signup: async () => {
          throw new HttpError('offline')
        },
      })
      await first.flow.signUp('token')
      const key = first.storage.key!

      const next = first.reload()
      await next.flow.resume(null)
      expect(next.flow.state()).toMatchObject({ ready: true, finishing: true })
      await next.flow.finish()
      expect(next.deps.server.signup).not.toHaveBeenCalled()
      expect(next.deps.account.openWebSessionWithTicket).toHaveBeenCalledWith(
        'passkey-ticket',
        key,
        { expectAccountId: ACCOUNT }
      )
      expect(next.flow.state().recoveryKey).toEqual({ signInOnly: false })
    })

    it('starts over, and forgets the passkey, when the server never stored it', async () => {
      const first = setup({
        signup: async () => {
          throw new HttpError('offline')
        },
      })
      await first.flow.signUp('token')
      const next = first.reload({
        assert: async () => {
          throw failure(403, 'passkey_failed', {
            reason: 'unknown_credential',
          })
        },
      })
      await next.flow.resume(null)
      await next.flow.finish()
      expect(next.storage.key).toBeNull()
      expect(next.storage.mark).toBeNull()
      expect(next.deps.signalUnknownPasskey).toHaveBeenCalledWith(
        RP_ID,
        CREDENTIAL
      )
      expect(next.flow.state()).toMatchObject({
        finishing: false,
        problem: { failure: 'notCreated' },
      })
    })

    it('Finish waits while another tab is finishing', async () => {
      const first = setup({
        signup: async () => {
          throw new HttpError('offline')
        },
      })
      await first.flow.signUp('token')
      first.storage.locked = true
      await first.flow.finish()
      expect(first.flow.state()).toMatchObject({
        finishing: true,
        problem: { failure: 'otherTab' },
      })
      expect(first.storage.key).not.toBeNull()
    })
  })

  describe('a stale tab', () => {
    it('finishes another tab’s sign-up, never taking its key for gone', async () => {
      // Tab B launched before tab A signed up: B's memory holds no key.
      const b = setup()
      await b.flow.resume(null)
      const a = b.tab({
        signup: async () => {
          throw new HttpError('offline')
        },
      })
      await a.flow.signUp('token')
      const aKey = a.storage.key
      expect(a.storage.mark).toMatchObject({ stage: 'sent' })

      // In B: Create an Account finds the sign-up to finish.
      await b.flow.signUp('token-b')
      expect(b.flow.state().finishing).toBe(true)
      expect(b.deps.accountKey.create).not.toHaveBeenCalled()
      await b.flow.finish()

      expect(b.storage.key).toBe(aKey)
      expect(b.deps.account.openWebSessionWithTicket).toHaveBeenCalledWith(
        'passkey-ticket',
        aKey,
        { expectAccountId: ACCOUNT }
      )
      expect(b.flow.state().recoveryKey).toEqual({ signInOnly: false })
    })

    it('never deletes a key it reads as gone from memory alone', async () => {
      const b = setup()
      await b.flow.resume(null)
      // Another tab's sign-up, never sent, left behind.
      const key = random(32)
      b.storage.key = key
      b.storage.mark = {
        accountId: ACCOUNT,
        accountPub: pubOf(key),
        stage: 'key',
      }
      await b.flow.signUp('token')
      // Its own leftover, read from storage: replaced, not kept beside.
      expect(b.deps.accountKey.discard).toHaveBeenCalledWith(key)
    })
  })

  describe('a passkey the server found for another user', () => {
    it('keeps the key and the mark, and reports nothing unknown', async () => {
      const first = setup({
        signup: async () => {
          throw new HttpError('offline')
        },
      })
      await first.flow.signUp('token')
      const key = first.storage.key
      const next = first.reload({
        assert: async () => {
          throw failure(403, 'passkey_failed', { reason: 'user_handle' })
        },
      })
      await next.flow.resume(null)
      await next.flow.finish()
      expect(next.storage.key).toBe(key)
      expect(next.storage.mark).toMatchObject({ stage: 'sent' })
      expect(next.deps.signalUnknownPasskey).not.toHaveBeenCalled()
      expect(next.flow.state()).toMatchObject({
        finishing: true,
        problem: { failure: 'wrongPasskey' },
      })
    })
  })

  describe('an account that exists, whose passkey is gone', () => {
    it('keeps the key, and offers the recovery key', async () => {
      const key = random(32)
      const { flow, storage, deps } = setup({
        stored: {
          key,
          mark: {
            accountId: ACCOUNT,
            accountPub: pubOf(key),
            stage: 'created',
            credentialId: CREDENTIAL,
            rpId: RP_ID,
          },
        },
        assert: async () => {
          throw failure(403, 'passkey_failed', { reason: 'unknown_credential' })
        },
      })
      await flow.resume(null)
      await flow.finish()
      expect(storage.key).toBe(key)
      expect(storage.mark).toMatchObject({ stage: 'created' })
      expect(deps.signalUnknownPasskey).not.toHaveBeenCalled()
      expect(flow.state()).toMatchObject({
        finishing: true,
        heldKey: { why: 'passkeyGone', recoveryKey: encodeRecoveryKey(key) },
        problem: null,
      })
    })
  })

  describe('a cancelled Finish', () => {
    it('names the passkey to pick', async () => {
      const first = setup({
        signup: async () => {
          throw new HttpError('offline')
        },
      })
      await first.flow.signUp('token')
      expect(first.storage.mark).toMatchObject({
        passkeyName: passkeyName(HANDLE),
      })
      const next = first.reload({
        get: async () => {
          throw new PasskeyError('cancelled')
        },
      })
      await next.flow.resume(null)
      await next.flow.finish()
      expect(next.flow.state()).toMatchObject({
        finishing: true,
        finishStage: 'sent',
        problem: { failure: 'pickPasskey', passkeyName: passkeyName(HANDLE) },
      })
      expect(next.storage.key).not.toBeNull()
    })

    it('says so for an account that exists, which the recovery key opens', async () => {
      const key = random(32)
      const { flow } = setup({
        stored: {
          key,
          mark: {
            accountId: ACCOUNT,
            accountPub: pubOf(key),
            stage: 'created',
            credentialId: CREDENTIAL,
            passkeyName: passkeyName(HANDLE),
          },
        },
        get: async () => {
          throw new PasskeyError('cancelled')
        },
      })
      await flow.resume(null)
      await flow.finish()
      expect(flow.state()).toMatchObject({
        finishStage: 'created',
        problem: { failure: 'pickPasskey' },
      })
      await flow.passkeyIsGone()
      expect(flow.state()).toMatchObject({
        heldKey: { why: 'passkeyGone', recoveryKey: encodeRecoveryKey(key) },
        problem: null,
      })
    })

    it('treats a timed-out prompt like a closed one', async () => {
      const key = random(32)
      const { flow } = setup({
        stored: {
          key,
          mark: {
            accountId: ACCOUNT,
            accountPub: pubOf(key),
            stage: 'created',
            passkeyName: passkeyName(HANDLE),
          },
        },
        get: async () => {
          throw new PasskeyError('timeout')
        },
      })
      await flow.resume(null)
      await flow.finish()
      expect(flow.state()).toMatchObject({
        finishStage: 'created',
        problem: { failure: 'pickPasskey', passkeyName: passkeyName(HANDLE) },
      })
    })
  })

  describe('a deleted passkey', () => {
    /** A sign-up whose outcome is unknown, its prompt closed at Finish. */
    async function closedAt(stage: 'sent' | 'created', stored?: Uint8Array) {
      const key = random(32)
      const result = setup({
        stored: {
          key: stored === undefined ? key : stored,
          mark: {
            accountId: ACCOUNT,
            accountPub: pubOf(key),
            stage,
            credentialId: CREDENTIAL,
            rpId: RP_ID,
            passkeyName: passkeyName(HANDLE),
          },
        },
        get: async () => {
          throw new PasskeyError('cancelled')
        },
      })
      await result.flow.resume(null)
      await result.flow.finish()
      return { ...result, key }
    }

    it('offers the recovery key while the account may exist', async () => {
      const { flow, key } = await closedAt('sent')
      await flow.passkeyIsGone()
      expect(flow.state()).toMatchObject({
        finishing: true,
        heldKey: { why: 'mayExist', recoveryKey: encodeRecoveryKey(key) },
      })
    })

    it('checks the stored key is the sign-up’s before showing it', async () => {
      const { flow, storage, events } = await closedAt('created', random(32))
      await flow.passkeyIsGone()
      expect(flow.state()).toMatchObject({
        finishing: false,
        heldKey: null,
        problem: { failure: 'failed' },
      })
      expect(storage.mark).toBeNull()
      expect(events).toContainEqual({
        type: 'failed',
        step: 'finish',
        reason: 'keyMissing',
      })
    })

    it('says it failed, never a silent Finish, when storage can’t be read', async () => {
      const { flow, deps } = await closedAt('created')
      deps.accountKey.readStored.mockRejectedValueOnce(new Error('blocked'))
      await flow.passkeyIsGone()
      expect(flow.state()).toMatchObject({
        finishing: true,
        heldKey: null,
        problem: { failure: 'failed' },
      })
    })

    it('starts over when no account has the key', async () => {
      const { flow, storage, deps, key } = await closedAt('sent')
      await flow.passkeyIsGone()
      await flow.forgetUnknownAccount(key)
      expect(storage.key).toBeNull()
      expect(storage.mark).toBeNull()
      expect(deps.signalUnknownPasskey).toHaveBeenCalledWith(RP_ID, CREDENTIAL)
      expect(flow.state()).toMatchObject({
        finishing: false,
        heldKey: null,
        problem: { failure: 'notCreated' },
      })
    })

    it('never forgets an account that was created', async () => {
      const { flow, storage, key } = await closedAt('created')
      await flow.passkeyIsGone()
      await flow.forgetUnknownAccount(key)
      expect(storage.key).toBe(key)
      expect(storage.mark).toMatchObject({ stage: 'created' })
    })

    it('never forgets a key other than the stored one', async () => {
      const { flow, storage, key } = await closedAt('sent')
      await flow.passkeyIsGone()
      await flow.forgetUnknownAccount(random(32))
      expect(storage.key).toBe(key)
    })
  })

  describe('an unreadable mark beside a key', () => {
    it('shows the key this browser holds, with its own state', async () => {
      const key = random(32)
      const { flow, storage } = setup({ stored: { key, mark: 'unreadable' } })
      await flow.resume(null)
      expect(flow.state()).toMatchObject({
        ready: true,
        finishing: false,
        heldKey: { why: 'unreadable', recoveryKey: encodeRecoveryKey(key) },
      })
      expect(storage.key).toBe(key)
    })

    it('says so when Create an Account finds it', async () => {
      const key = random(32)
      const { flow } = setup({ stored: { key, mark: 'unreadable' } })
      await flow.signUp('token')
      expect(flow.state().heldKey).toMatchObject({ why: 'unreadable' })
    })

    it('forgets the key when no account has it', async () => {
      const key = random(32)
      const { flow, storage } = setup({ stored: { key, mark: 'unreadable' } })
      await flow.resume(null)
      await flow.forgetUnknownAccount(key)
      expect(storage.key).toBeNull()
      expect(storage.mark).toBeNull()
      expect(flow.state().heldKey).toBeNull()
    })

    it('is settled once the account it opens is signed in', async () => {
      const key = random(32)
      const { flow, storage } = setup({ stored: { key, mark: 'unreadable' } })
      await flow.resume(ACCOUNT)
      expect(storage.mark).toBeNull()
      expect(flow.state().heldKey).toBeNull()
    })
  })

  describe('the key guard for sign-ins', () => {
    function guard(
      mark: WebSignUpMark | null | 'unreadable',
      stored: Uint8Array | null,
      lockFree = true
    ) {
      return createSignUpKeyGuard({
        mark: {
          read: async () => {
            if (mark === 'unreadable') throw new WebSignUpMarkUnreadable()
            return mark
          },
          write: async () => undefined,
        },
        readStoredKey: async () => stored,
        lockFree: async () => lockFree,
      })
    }
    const theirs = random(32)
    const mine = random(32)
    const at = (stage: WebSignUpMark['stage']): WebSignUpMark => ({
      accountId: ACCOUNT,
      accountPub: pubOf(theirs),
      stage,
    })

    it('refuses another key while a sign-up may have made an account', async () => {
      expect(await guard(at('sent'), theirs)(mine)).toBe('signUpPending')
      expect(await guard(at('created'), theirs)(mine)).toBe('signUpPending')
      expect(await guard(at('sent'), theirs)(theirs)).toBeNull()
    })

    it('refuses another key while another tab is signing up', async () => {
      expect(await guard(at('key'), theirs, false)(mine)).toBe('signUpPending')
      expect(await guard(at('key'), theirs, true)(mine)).toBeNull()
    })

    it('says a held key is what stops it, beside an unreadable mark', async () => {
      expect(await guard('unreadable', theirs)(mine)).toBe('keyHeld')
      expect(await guard('unreadable', theirs)(theirs)).toBeNull()
      expect(await guard('unreadable', null)(mine)).toBeNull()
    })
  })

  describe('the sign-in that finishes', () => {
    it('takes only the challenge from the server', async () => {
      const first = setup({
        signup: async () => {
          throw new HttpError('offline')
        },
      })
      await first.flow.signUp('token')
      const next = first.reload()
      await next.flow.resume(null)
      await next.flow.finish()
      const asked = next.deps.ceremonies.get.mock.calls.at(-1)?.[0]
      expect(asked).toEqual({
        challenge: 'sign-in',
        rpId: RP_ID,
        userVerification: 'required',
        allowCredentials: [{ id: CREDENTIAL, type: 'public-key' }],
        timeout: 300_000,
      })
    })
  })

  describe('a lock that fails', () => {
    it('never leaves sign-up busy', async () => {
      const { flow, deps } = setup()
      deps.lock.mockRejectedValueOnce(new Error('locks broke'))
      await flow.signUp('token')
      expect(flow.state()).toMatchObject({
        busy: false,
        problem: { failure: 'failed' },
      })
    })

    it('never leaves Finish busy', async () => {
      const first = setup({
        signup: async () => {
          throw new HttpError('offline')
        },
      })
      await first.flow.signUp('token')
      first.deps.lock.mockRejectedValueOnce(new Error('locks broke'))
      await first.flow.finish()
      expect(first.flow.state()).toMatchObject({
        busy: false,
        finishing: true,
        problem: { failure: 'failed' },
      })
    })
  })

  describe('a mismatched answer', () => {
    it('closes the session it opened, and finishes with the passkey', async () => {
      const { flow, deps } = setup({
        signup: async () => ({
          ...opened(OTHER_ACCOUNT),
          accessToken: 'stray-access',
          credentialId: CREDENTIAL,
        }),
      })
      await flow.signUp('token')
      expect(deps.server.closeOpened).toHaveBeenCalledWith('stray-access')
      expect(deps.account.adoptSignupSession).not.toHaveBeenCalled()
      expect(flow.state()).toMatchObject({
        finishing: true,
        problem: { failure: 'failed' },
      })
    })
  })

  describe('keeping the session', () => {
    it('finishes with the passkey when the browser couldn’t keep the session', async () => {
      const { flow, deps, storage } = setup({
        adopt: async () => {
          throw new WebSignInError('storage')
        },
      })
      await flow.signUp('token')
      expect(storage.mark).toMatchObject({ stage: 'created' })
      expect(flow.state()).toMatchObject({
        finishing: true,
        problem: { failure: 'storage' },
      })
      await flow.finish()
      expect(deps.server.signup).toHaveBeenCalledOnce()
      expect(deps.account.openWebSessionWithTicket).toHaveBeenCalledOnce()
      expect(flow.state().recoveryKey).not.toBeNull()
    })

    it('reloads away from Turnstile’s script, onto the recovery key', async () => {
      const first = setup({ needsReload: true })
      await first.flow.signUp('token')
      expect(first.deps.reload).toHaveBeenCalledOnce()
      expect(first.flow.state()).toMatchObject({
        busy: true,
        recoveryKey: null,
      })

      const next = first.reload({ needsReload: false })
      await next.flow.resume(ACCOUNT)
      expect(next.flow.state().recoveryKey).toEqual({ signInOnly: false })
    })
  })

  describe('the recovery key’s gate', () => {
    it('reopens on every launch until the User saves the key', async () => {
      const first = setup({
        created: async () => made({ enabled: false, first: null }),
      })
      await first.flow.signUp('token')

      const second = first.reload()
      await second.flow.resume(ACCOUNT)
      expect(second.flow.state().recoveryKey).toEqual({ signInOnly: true })

      await second.flow.confirmRecoveryKey()
      expect(second.flow.state().recoveryKey).toBeNull()
      expect(second.storage.mark).toBeNull()
      expect(second.events).toEqual([{ type: 'recoveryKeySaved' }])

      const third = second.reload()
      await third.flow.resume(ACCOUNT)
      expect(third.flow.state()).toMatchObject({
        ready: true,
        recoveryKey: null,
      })
    })

    it('shows for the account that was made even if its answer was lost', async () => {
      const { flow } = setup({
        stored: {
          key: random(32),
          mark: {
            accountId: ACCOUNT,
            accountPub: 'pub',
            stage: 'sent',
            signInOnly: true,
          },
        },
      })
      await flow.resume(ACCOUNT)
      expect(flow.state().recoveryKey).toEqual({ signInOnly: true })
    })

    it('ends when another account signs in', async () => {
      const { flow, storage } = setup({
        stored: {
          mark: { accountId: ACCOUNT, accountPub: 'pub', stage: 'created' },
        },
      })
      await flow.resume(OTHER_ACCOUNT)
      expect(flow.state().recoveryKey).toBeNull()
      expect(storage.mark).toBeNull()
    })
  })
})
