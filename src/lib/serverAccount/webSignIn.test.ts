import { randomBytes as nodeRandomBytes } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { toB64u } from '@/lib/bytes'
import { HttpError } from '@/lib/http/request'
import { PasskeyError } from '@/lib/passkeys/errors'
import type {
  BrowserApproval,
  BrowserApprovalState,
} from '@/lib/serverAccount/approvalSession'
import { deriveAccountSigningKey } from '@/lib/serverAccount/keys'
import type { PasskeySignIn } from '@/lib/serverAccount/passkeyClient'
import {
  type PasskeyWrap,
  unwrapAccountKey,
  wrapAccountKey,
} from '@/lib/serverAccount/passkeys'
import { WebSignInError } from '@/lib/serverAccount/webAccount'
import {
  createWebSignIn,
  type WebSignInDeps,
  type WebSignInEvent,
} from '@/lib/serverAccount/webSignIn'
import type { WebSignInMark } from '@/lib/serverAccount/webSignInMark'

vi.mock('@/lib/logger', () => import('@/__tests__/mocks/logger'))

const random = (length: number) => new Uint8Array(nodeRandomBytes(length))
const NOW = 1_800_000_000_000
const KEY = random(32)
const OTHER_KEY = random(32)
const PUB = deriveAccountSigningKey(KEY).publicKey
const ACCOUNT = 'acct_aaaaaaaaaaaaaaaaaaaaaa'
const OTHER_ACCOUNT = 'acct_bbbbbbbbbbbbbbbbbbbbbb'
const CREDENTIAL = toB64u(random(16))
const PRF = random(32)

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

const assertion = (prf: Uint8Array | null) => ({
  response: {
    id: CREDENTIAL,
    rawId: CREDENTIAL,
    type: 'public-key' as const,
    response: {
      clientDataJSON: '',
      authenticatorData: '',
      signature: '',
    },
    clientExtensionResults: {},
  },
  prf,
})

const signIn = (wraps: PasskeyWrap[], ticketAt = NOW): PasskeySignIn => ({
  accountId: ACCOUNT,
  accountPub: PUB,
  status: 'active',
  keyEpoch: 0,
  credentialId: CREDENTIAL,
  userHandle: 'aGFuZGxl',
  wraps,
  ticket: 'passkey-ticket',
  ticketExpiresAt: ticketAt + 120_000,
})

/** A browser approval the test moves by hand. */
function fakeApproval() {
  let state: BrowserApprovalState = { step: 'idle' }
  const listeners = new Set<() => void>()
  const set = (next: BrowserApprovalState) => {
    state = next
    for (const listener of listeners) listener()
  }
  const approval = {
    get state() {
      return state
    },
    subscribe: (listener: () => void) => {
      listeners.add(listener)
      return () => void listeners.delete(listener)
    },
    start: vi.fn(async () =>
      set({ step: 'showing', link: 'x', expiresAt: NOW, codes: 1 })
    ),
    restart: vi.fn(async () => undefined),
    finish: vi.fn(async () => {
      if (state.step === 'received')
        set({ step: 'done', deviceName: state.received.deviceName })
    }),
    cancel: vi.fn(async () => set({ step: 'cancelled' })),
    dispose: vi.fn(),
    fail: vi.fn((reason) => set({ step: 'failed', reason })),
    debug: vi.fn(),
  }
  return {
    approval: approval as unknown as BrowserApproval & typeof approval,
    receive: (accountKey: Uint8Array, accountId = ACCOUNT) =>
      set({
        step: 'received',
        code: '123456',
        received: {
          accountKey,
          accountId,
          deviceName: 'Sample Phone',
          ticket: 'approval-ticket',
          ticketExpiresAt: NOW + 120_000,
        },
      }),
  }
}

function setup(
  options: {
    assert?: () => Promise<PasskeySignIn>
    prf?: Uint8Array | null
    get?: () => Promise<ReturnType<typeof assertion>>
    reload?: boolean
    saveWrap?: () => Promise<void>
    recovery?: WebSignInDeps['recovery']
    open?: WebSignInDeps['account']['openWebSessionWithTicket']
    /** The page loaded Turnstile's script. */
    needsReload?: boolean
  } = {}
) {
  let now = NOW
  const timers: { at: number; run: () => void; done: boolean }[] = []
  let mark: WebSignInMark | null = null
  const events: WebSignInEvent[] = []
  const phone = fakeApproval()
  const saved: (PasskeyWrap & { credentialId: string })[] = []
  const opened: { ticket: string; key: Uint8Array; expect?: string }[] = []
  const deps = {
    account: {
      openWebSessionWithTicket: vi.fn(
        options.open ??
          (async (
            ticket: string,
            key: Uint8Array,
            { expectAccountId, onStored } = {}
          ) => {
            opened.push({ ticket, key, expect: expectAccountId })
            if (expectAccountId && expectAccountId !== ACCOUNT)
              throw new WebSignInError('wrongAccount')
            await onStored?.()
            return {
              accountId: ACCOUNT,
              sessionId: 'sess',
              reload: options.reload ?? false,
            }
          })
      ),
      signOut: vi.fn(async () => undefined),
    },
    passkeys: {
      challenge: vi.fn(async () => ({
        challengeToken: 'challenge-token',
        options: { challenge: 'abc' },
      })),
      get: vi.fn(
        options.get ??
          (async () => assertion(options.prf === undefined ? PRF : options.prf))
      ),
      assert: vi.fn(options.assert ?? (async () => signIn([wrapOf(PRF)]))),
      saveWrap: vi.fn(
        async (
          _key: Uint8Array,
          wrap: PasskeyWrap & { credentialId: string }
        ) => {
          saved.push(wrap)
          await options.saveWrap?.()
        }
      ),
    },
    recovery: vi.fn(
      options.recovery ??
        (async () => ({
          accountId: ACCOUNT,
          ticket: 'recovery-ticket',
          ticketExpiresAt: now + 120_000,
        }))
    ),
    createApproval: vi.fn(() => phone.approval),
    accountKey: vi.fn(async () => KEY),
    mark: {
      read: () => mark,
      write: (next: WebSignInMark | null) => {
        mark = next && Object.keys(next).length > 0 ? { ...next } : null
      },
    },
    randomBytes: random,
    now: () => now,
    schedule: (run: () => void, ms: number) => {
      const timer = { at: now + ms, run, done: false }
      timers.push(timer)
      return () => {
        timer.done = true
      }
    },
    pageNeedsReload: () => options.needsReload ?? false,
    reload: vi.fn(),
    onEvent: (event: WebSignInEvent) => events.push(event),
  } satisfies WebSignInDeps
  const flow = createWebSignIn(deps)
  return {
    flow,
    deps,
    events,
    phone,
    saved,
    opened,
    mark: () => mark,
    advance: (ms: number) => {
      now += ms
      for (const timer of timers)
        if (!timer.done && timer.at <= now) {
          timer.done = true
          timer.run()
        }
    },
  }
}

/** A wrap the browser saved opens, with the PRF output, to the account key. */
const opensToKey = (wrap: PasskeyWrap & { credentialId: string }) =>
  unwrapAccountKey({
    prfOutput: PRF,
    accountId: ACCOUNT,
    credentialId: wrap.credentialId,
    keyEpoch: wrap.keyEpoch,
    wrap: wrap.wrap,
  })

describe('signing in with a passkey', () => {
  it('opens the session with its ticket when a wrap unlocks', async () => {
    const { flow, opened, events, saved } = setup()
    await flow.signInWithPasskey()
    expect(opened).toEqual([
      { ticket: 'passkey-ticket', key: KEY, expect: ACCOUNT },
    ])
    expect(flow.state()).toMatchObject({
      busy: null,
      problem: null,
      cantUnlock: null,
      cloudSync: true,
    })
    expect(saved).toEqual([])
    expect(events).toEqual([
      { type: 'started', method: 'passkey' },
      {
        type: 'succeeded',
        method: 'passkey',
        afterPasskey: false,
        wrap: 'none',
      },
    ])
  })

  it('never trusts a wrap that opens to another key', async () => {
    const other = wrapAccountKey(
      {
        prfOutput: PRF,
        accountKey: OTHER_KEY,
        accountId: ACCOUNT,
        credentialId: CREDENTIAL,
        keyEpoch: 0,
      },
      random(24)
    )
    const { flow, opened } = setup({
      assert: async () =>
        signIn([{ wrapId: toB64u(random(16)), keyEpoch: 0, wrap: other }]),
    })
    await flow.signInWithPasskey()
    expect(opened).toEqual([])
    expect(flow.state().cantUnlock?.reason).toBe('wrongKey')
  })

  it('says nothing when the User closes the prompt', async () => {
    const { flow, events } = setup({
      get: async () => {
        throw new PasskeyError('cancelled')
      },
    })
    await flow.signInWithPasskey()
    expect(flow.state()).toMatchObject({ busy: null, problem: null })
    expect(events.at(-1)).toEqual({
      type: 'failed',
      method: 'passkey',
      reason: 'cancelled',
    })
  })

  it('tells a passkey the account no longer has', async () => {
    const { flow } = setup({
      assert: async () => {
        throw new HttpError('server', 403, 'passkey_failed', null, undefined, {
          reason: 'unknown_credential',
        })
      },
    })
    await flow.signInWithPasskey()
    expect(flow.state().problem).toEqual({
      method: 'passkey',
      failure: 'noPasskey',
      retryAfterMs: null,
    })
  })

  it('says when to try again after too many failures', async () => {
    const { flow } = setup({
      assert: async () => {
        throw new HttpError('rateLimited', 429, 'rate_limited', 600_000)
      },
    })
    await flow.signInWithPasskey()
    expect(flow.state().problem).toEqual({
      method: 'passkey',
      failure: 'rateLimited',
      retryAfterMs: 600_000,
    })
  })

  it('refuses a sign-in for another credential than the one used', async () => {
    const { flow, opened, events } = setup({
      assert: async () => ({
        ...signIn([wrapOf(PRF)]),
        credentialId: toB64u(random(16)),
      }),
    })
    await flow.signInWithPasskey()
    expect(opened).toEqual([])
    expect(flow.state().problem).toMatchObject({ failure: 'passkeyFailed' })
    expect(events.at(-1)).toEqual({
      type: 'failed',
      method: 'passkey',
      reason: 'credential',
    })
  })

  it('runs one sign-in at a time', async () => {
    const { flow, deps } = setup()
    await Promise.all([flow.signInWithPasskey(), flow.signInWithPasskey()])
    expect(deps.passkeys.challenge).toHaveBeenCalledTimes(1)
  })
})

describe('a passkey that signs in but can’t unlock', () => {
  it('finishes with the recovery key on the passkey’s ticket, then saves a wrap', async () => {
    const { flow, deps, opened, saved, events } = setup({
      assert: async () => signIn([]),
    })
    await flow.signInWithPasskey()
    expect(flow.state().cantUnlock?.reason).toBe('noWraps')
    expect(opened).toEqual([])
    expect(flow.state().recoveryNeedsCheck).toBe(false)

    await flow.signInWithRecoveryKey(KEY, null)
    // No security check: the passkey's ticket opened the session.
    expect(deps.recovery).not.toHaveBeenCalled()
    expect(opened).toEqual([
      { ticket: 'passkey-ticket', key: KEY, expect: ACCOUNT },
    ])
    expect(saved).toHaveLength(1)
    expect(saved[0]).toMatchObject({ credentialId: CREDENTIAL, keyEpoch: 0 })
    expect(opensToKey(saved[0])).toEqual(KEY)
    expect(flow.state()).toMatchObject({ cantUnlock: null, wrapSaved: true })
    expect(events).toContainEqual({
      type: 'cantUnlock',
      reason: 'noWraps',
      prf: true,
    })
    expect(events.at(-1)).toEqual({
      type: 'succeeded',
      method: 'recovery',
      afterPasskey: true,
      wrap: 'saved',
    })
  })

  it('unlocks next time with the wrap it saved', async () => {
    const first = setup({ assert: async () => signIn([]) })
    await first.flow.signInWithPasskey()
    await first.flow.signInWithRecoveryKey(KEY, null)
    const { accountId: _, ...savedWrap } = { accountId: '', ...first.saved[0] }

    const next = setup({ assert: async () => signIn([savedWrap]) })
    await next.flow.signInWithPasskey()
    expect(next.flow.state().cantUnlock).toBeNull()
    expect(next.opened).toEqual([
      { ticket: 'passkey-ticket', key: KEY, expect: ACCOUNT },
    ])
  })

  it('uses the security check once the passkey’s ticket ran out', async () => {
    const { flow, deps, opened, saved, advance } = setup({
      assert: async () => signIn([]),
    })
    await flow.signInWithPasskey()
    advance(118_000)
    expect(flow.state().recoveryNeedsCheck).toBe(true)
    await flow.signInWithRecoveryKey(KEY, 'turnstile-token')
    expect(deps.recovery).toHaveBeenCalledWith(KEY, 'turnstile-token')
    expect(opened.map((open) => open.ticket)).toEqual(['recovery-ticket'])
    expect(opensToKey(saved[0])).toEqual(KEY)
  })

  it('falls back to the check when the passkey’s ticket was refused', async () => {
    let first = true
    const { flow, deps, saved } = setup({
      assert: async () => signIn([]),
      open: async (ticket) => {
        if (first) {
          first = false
          expect(ticket).toBe('passkey-ticket')
          throw new HttpError('server', 403, 'ticket_invalid')
        }
        return { accountId: ACCOUNT, sessionId: 'sess', reload: false }
      },
    })
    await flow.signInWithPasskey()
    await flow.signInWithRecoveryKey(KEY, 'turnstile-token')
    expect(deps.recovery).toHaveBeenCalledTimes(1)
    expect(flow.state().problem).toBeNull()
    expect(saved).toHaveLength(1)
  })

  it('asks for the security check once the passkey’s ticket is about to run out', async () => {
    const { flow, advance } = setup({ assert: async () => signIn([]) })
    await flow.signInWithPasskey()
    const seen: boolean[] = []
    flow.subscribe(() => seen.push(flow.state().recoveryNeedsCheck))
    advance(114_000)
    expect(flow.state().recoveryNeedsCheck).toBe(false)
    // 5 seconds before the 2-minute ticket expires, without a re-render.
    advance(2_000)
    expect(flow.state().recoveryNeedsCheck).toBe(true)
    expect(seen).toContain(true)
  })

  it('says to do the security check when the ticket ran out without one', async () => {
    const { flow, deps, opened, advance } = setup({
      assert: async () => signIn([]),
    })
    await flow.signInWithPasskey()
    advance(118_000)
    await flow.signInWithRecoveryKey(KEY, null)
    expect(deps.recovery).not.toHaveBeenCalled()
    expect(opened).toEqual([])
    expect(flow.state()).toMatchObject({
      busy: null,
      recoveryNeedsCheck: true,
      problem: { method: 'recovery', failure: 'checkNeeded' },
    })
  })

  it('asks for the check when the passkey’s ticket was refused', async () => {
    const { flow, deps } = setup({
      assert: async () => signIn([]),
      open: async () => {
        throw new HttpError('server', 403, 'ticket_invalid')
      },
    })
    await flow.signInWithPasskey()
    await flow.signInWithRecoveryKey(KEY, null)
    expect(deps.recovery).not.toHaveBeenCalled()
    expect(flow.state()).toMatchObject({
      recoveryNeedsCheck: true,
      problem: { method: 'recovery', failure: 'checkNeeded' },
    })
  })

  it('zeroes the passkey’s PRF output once another way signs in', async () => {
    const prf = new Uint8Array(PRF)
    const { flow } = setup({ assert: async () => signIn([]), prf })
    await flow.signInWithPasskey()
    await flow.signInWithRecoveryKey(KEY, null)
    expect(prf.every((byte) => byte === 0)).toBe(true)
  })

  it('forgets the passkey and zeroes its PRF output when the screen goes', async () => {
    const prf = new Uint8Array(PRF)
    const { flow, advance } = setup({ assert: async () => signIn([]), prf })
    await flow.signInWithPasskey()
    flow.leave()
    expect(prf.every((byte) => byte === 0)).toBe(true)
    expect(flow.state()).toMatchObject({
      cantUnlock: null,
      recoveryNeedsCheck: true,
    })
    // The ticket's timer is gone with it.
    advance(200_000)
    expect(flow.state().recoveryNeedsCheck).toBe(true)
  })

  it('forgets the last passkey when another passkey sign-in starts', async () => {
    const prf = new Uint8Array(PRF)
    let first = true
    const { flow } = setup({
      assert: async () => signIn([]),
      get: async () => {
        if (first) {
          first = false
          return assertion(prf)
        }
        throw new PasskeyError('cancelled', 'closed')
      },
    })
    await flow.signInWithPasskey()
    expect(flow.state().cantUnlock).not.toBeNull()
    await flow.signInWithPasskey()
    expect(flow.state().cantUnlock).toBeNull()
    expect(prf.every((byte) => byte === 0)).toBe(true)
  })

  it('finishes with the phone, then saves a wrap', async () => {
    const { flow, phone, opened, saved } = setup({
      assert: async () => signIn([wrapOf(random(32))]),
    })
    await flow.signInWithPasskey()
    expect(flow.state().cantUnlock?.reason).toBe('noneOpened')
    flow.startPhone()
    phone.receive(KEY)
    await vi.waitFor(() => expect(flow.state().approvedBy).toBe('Sample Phone'))
    expect(opened).toEqual([
      { ticket: 'approval-ticket', key: KEY, expect: ACCOUNT },
    ])
    expect(phone.approval.finish).toHaveBeenCalled()
    expect(opensToKey(saved[0])).toEqual(KEY)
  })

  it('saves nothing for a passkey that gave no PRF output', async () => {
    const { flow, saved, opened } = setup({
      prf: null,
      assert: async () => signIn([wrapOf(PRF)]),
    })
    await flow.signInWithPasskey()
    expect(flow.state().cantUnlock?.reason).toBe('noPrf')
    await flow.signInWithRecoveryKey(KEY, null)
    expect(opened).toHaveLength(1)
    expect(saved).toEqual([])
    expect(flow.state().wrapSaved).toBeNull()
  })

  it('still signs in when the wrap can’t be saved', async () => {
    const { flow, opened } = setup({
      assert: async () => signIn([]),
      saveWrap: async () => {
        throw new HttpError('server', 409, 'conflict')
      },
    })
    await flow.signInWithPasskey()
    await flow.signInWithRecoveryKey(KEY, null)
    expect(opened).toHaveLength(1)
    expect(flow.state()).toMatchObject({ problem: null, wrapSaved: false })
  })

  it('refuses a recovery key of another account', async () => {
    const { flow, deps, opened } = setup({ assert: async () => signIn([]) })
    await flow.signInWithPasskey()
    await flow.signInWithRecoveryKey(OTHER_KEY, 'turnstile-token')
    expect(deps.recovery).not.toHaveBeenCalled()
    expect(opened).toEqual([])
    expect(flow.state()).toMatchObject({
      cantUnlock: { reason: 'noWraps', prf: true },
      problem: { method: 'recovery', failure: 'wrongAccount' },
    })
  })

  it('refuses a recovery ticket for another account', async () => {
    const { flow, opened, advance } = setup({
      assert: async () => signIn([]),
      recovery: async () => ({
        accountId: OTHER_ACCOUNT,
        ticket: 'recovery-ticket',
        ticketExpiresAt: NOW + 240_000,
      }),
    })
    await flow.signInWithPasskey()
    advance(120_000)
    await flow.signInWithRecoveryKey(KEY, 'turnstile-token')
    expect(opened).toEqual([])
    expect(flow.state().problem?.failure).toBe('wrongAccount')
  })

  it('refuses a phone that sends another account’s key', async () => {
    const { flow, phone, opened } = setup({ assert: async () => signIn([]) })
    await flow.signInWithPasskey()
    flow.startPhone()
    phone.receive(OTHER_KEY, OTHER_ACCOUNT)
    await vi.waitFor(() =>
      expect(flow.state().problem?.failure).toBe('wrongAccount')
    )
    expect(opened).toEqual([])
    expect(phone.approval.cancel).toHaveBeenCalled()
  })
})

describe('signing in with a recovery key', () => {
  it('opens the session with the recovery ticket', async () => {
    const { flow, deps, opened, events } = setup()
    expect(flow.state().recoveryNeedsCheck).toBe(true)
    await flow.signInWithRecoveryKey(KEY, 'turnstile-token')
    expect(deps.recovery).toHaveBeenCalledWith(KEY, 'turnstile-token')
    expect(opened).toEqual([
      { ticket: 'recovery-ticket', key: KEY, expect: ACCOUNT },
    ])
    expect(events.at(-1)).toEqual({
      type: 'succeeded',
      method: 'recovery',
      afterPasskey: false,
      wrap: 'none',
    })
  })

  it('says when the security check refused', async () => {
    const { flow, opened } = setup({
      recovery: async () => {
        throw new HttpError(
          'server',
          403,
          'turnstile_failed',
          null,
          undefined,
          {
            reason: 'timeout-or-duplicate',
          }
        )
      },
    })
    await flow.signInWithRecoveryKey(KEY, 'used-token')
    expect(opened).toEqual([])
    expect(flow.state().problem).toEqual({
      method: 'recovery',
      failure: 'turnstileFailed',
      retryAfterMs: null,
    })
  })

  it('says when the day’s tries are used up', async () => {
    const { flow } = setup({
      recovery: async () => {
        throw new HttpError('rateLimited', 429, 'rate_limited', 3_600_000)
      },
    })
    await flow.signInWithRecoveryKey(KEY, 'token')
    expect(flow.state().problem).toMatchObject({
      failure: 'rateLimited',
      retryAfterMs: 3_600_000,
    })
  })

  it('says when no account has the key', async () => {
    const { flow } = setup({
      recovery: async () => {
        throw new HttpError('server', 404, 'unknown_account')
      },
    })
    await flow.signInWithRecoveryKey(KEY, 'token')
    expect(flow.state().problem?.failure).toBe('unknownAccount')
  })

  it('says when the browser couldn’t keep the session', async () => {
    const { flow } = setup({
      open: async () => {
        throw new WebSignInError('storage')
      },
    })
    await flow.signInWithRecoveryKey(KEY, 'token')
    expect(flow.state().problem?.failure).toBe('storage')
  })
})

describe('using my phone', () => {
  it('opens the session for the sealed account and shows who approved', async () => {
    const { flow, phone, opened, mark, events } = setup()
    const approval = flow.startPhone()
    expect(approval.start).toHaveBeenCalled()
    phone.receive(KEY)
    await vi.waitFor(() => expect(flow.state().approvedBy).toBe('Sample Phone'))
    expect(opened).toEqual([
      { ticket: 'approval-ticket', key: KEY, expect: ACCOUNT },
    ])
    expect(phone.approval.state.step).toBe('done')
    // Kept until the User continues, so a reload still shows it.
    expect(mark()).toEqual({
      approvedBy: 'Sample Phone',
      openedAt: NOW,
      cloudSync: true,
    })
    expect(events.at(-1)).toMatchObject({ type: 'succeeded', method: 'phone' })

    flow.dismissApproved()
    expect(flow.state()).toMatchObject({ approvedBy: null, cloudSync: true })
    flow.cloudSyncChecked()
    expect(flow.state().cloudSync).toBe(false)
    expect(mark()).toBeNull()
  })

  it('offers Add a Passkey only while the sign-in still counts as a step-up', async () => {
    const { flow, phone, mark, advance } = setup()
    flow.startPhone()
    phone.receive(KEY)
    await vi.waitFor(() => expect(flow.state().approvedBy).not.toBeNull())
    expect(mark()).toMatchObject({ openedAt: NOW })
    expect(flow.state().canAddPasskey).toBe(true)
    expect(flow.addPasskeyAllowed()).toBe(true)
    // The server allows 5 minutes; the passkey prompt gets the last one.
    advance(4 * 60_000 - 1)
    expect(flow.addPasskeyAllowed()).toBe(true)
    advance(1)
    expect(flow.state().canAddPasskey).toBe(false)
    expect(flow.addPasskeyAllowed()).toBe(false)
    expect(flow.state().approvedBy).toBe('Sample Phone')
  })

  it('tells the phone it’s done before every tab reloads into the account', async () => {
    let finishedBeforeReload = 0
    const ctx: { phone?: ReturnType<typeof fakeApproval> } = {}
    const { flow, phone } = (() => {
      const made = setup({
        open: async (_ticket, _key, { onStored } = {}) => {
          await onStored?.()
          finishedBeforeReload = ctx.phone!.approval.finish.mock.calls.length
          return { accountId: ACCOUNT, sessionId: 'sess', reload: true }
        },
      })
      ctx.phone = made.phone
      return made
    })()
    flow.startPhone()
    phone.receive(KEY)
    await vi.waitFor(() => expect(phone.approval.state.step).toBe('done'))
    expect(finishedBeforeReload).toBe(1)
    expect(phone.approval.finish).toHaveBeenCalledTimes(1)
  })

  it('ends the channel when the session is for another account', async () => {
    const { flow, phone } = setup()
    flow.startPhone()
    phone.receive(OTHER_KEY, OTHER_ACCOUNT)
    await vi.waitFor(() =>
      expect(flow.state().problem?.failure).toBe('wrongAccount')
    )
    expect(phone.approval.fail).toHaveBeenCalledWith('tampered')
    expect(flow.state().approvedBy).toBeNull()
  })

  it('That Wasn’t Me signs out and forgets the mark', async () => {
    const { flow, phone, deps, mark, events } = setup()
    flow.startPhone()
    phone.receive(KEY)
    await vi.waitFor(() => expect(flow.state().approvedBy).not.toBeNull())
    await flow.thatWasntMe()
    expect(deps.account.signOut).toHaveBeenCalled()
    expect(mark()).toBeNull()
    expect(events.at(-1)).toEqual({ type: 'thatWasntMe' })
  })

  it('records an approval that failed', () => {
    const { flow, phone, events } = setup()
    flow.startPhone()
    phone.approval.fail('expired')
    expect(events.at(-1)).toEqual({
      type: 'failed',
      method: 'phone',
      reason: 'expired',
    })
  })

  it('ends the channels when the User leaves the code', () => {
    const { flow, phone } = setup()
    flow.startPhone()
    flow.stopPhone()
    expect(phone.approval.dispose).toHaveBeenCalled()
  })
})

describe('signing in as another account (every tab reloads)', () => {
  it('finishes the wrap and "Approved by" after the reload', async () => {
    const before = setup({ reload: true, assert: async () => signIn([]) })
    await before.flow.signInWithPasskey()
    before.flow.startPhone()
    before.phone.receive(KEY)
    await vi.waitFor(() => expect(before.opened).toHaveLength(1))
    // Nothing saved yet: the page is reloading.
    expect(before.saved).toEqual([])
    const kept = before.mark()
    expect(kept).toMatchObject({
      approvedBy: 'Sample Phone',
      wrap: { accountId: ACCOUNT, credentialId: CREDENTIAL, keyEpoch: 0 },
    })

    const after = setup()
    after.deps.mark.write(kept)
    await after.flow.resume(ACCOUNT)
    expect(after.flow.state()).toMatchObject({
      approvedBy: 'Sample Phone',
      cloudSync: true,
      wrapSaved: true,
    })
    expect(opensToKey(after.saved[0])).toEqual(KEY)
    expect(after.mark()).toEqual({
      approvedBy: 'Sample Phone',
      openedAt: NOW,
      cloudSync: true,
    })
  })
})

describe('after a reload', () => {
  const approved = (openedAt?: number): WebSignInMark => ({
    approvedBy: 'Sample Phone',
    cloudSync: true,
    ...(openedAt !== undefined && { openedAt }),
  })

  it('times Add a Passkey from when the session opened', async () => {
    const fresh = setup()
    fresh.deps.mark.write(approved(NOW - 60_000))
    await fresh.flow.resume(ACCOUNT)
    expect(fresh.flow.state()).toMatchObject({
      approvedBy: 'Sample Phone',
      canAddPasskey: true,
    })

    const stale = setup()
    stale.deps.mark.write(approved(NOW - 4.5 * 60_000))
    await stale.flow.resume(ACCOUNT)
    expect(stale.flow.state()).toMatchObject({
      approvedBy: 'Sample Phone',
      canAddPasskey: false,
    })
    expect(stale.flow.addPasskeyAllowed()).toBe(false)

    const unknown = setup()
    unknown.deps.mark.write(approved())
    await unknown.flow.resume(ACCOUNT)
    expect(unknown.flow.state().canAddPasskey).toBe(false)
  })

  it('never saves a marked wrap for another account than the one signed in', async () => {
    const { flow, deps, saved, mark } = setup()
    deps.mark.write({
      cloudSync: true,
      wrap: {
        accountId: OTHER_ACCOUNT,
        credentialId: CREDENTIAL,
        wrapId: 'w',
        keyEpoch: 0,
        wrap: 'x',
      },
    })
    await flow.resume(ACCOUNT)
    expect(saved).toEqual([])
    expect(mark()).toEqual({ cloudSync: true })
    expect(flow.state().wrapSaved).toBeNull()
  })
})

describe('a page that loaded the security check', () => {
  it('reloads once signed in, then saves the wrap', async () => {
    const before = setup({ needsReload: true, assert: async () => signIn([]) })
    await before.flow.signInWithPasskey()
    before.advance(118_000)
    await before.flow.signInWithRecoveryKey(KEY, 'turnstile-token')
    expect(before.opened.map((open) => open.ticket)).toEqual([
      'recovery-ticket',
    ])
    expect(before.deps.reload).toHaveBeenCalledTimes(1)
    expect(before.saved).toEqual([])
    expect(before.events.at(-1)).toMatchObject({
      type: 'succeeded',
      wrap: 'pending',
    })
    const kept = before.mark()
    expect(kept).toMatchObject({ cloudSync: true, wrap: {} })

    const after = setup()
    after.deps.mark.write(kept)
    await after.flow.resume(ACCOUNT)
    expect(opensToKey(after.saved[0])).toEqual(KEY)
    expect(after.flow.state()).toMatchObject({
      cloudSync: true,
      wrapSaved: true,
    })
  })

  it('stays put when the security check never loaded', async () => {
    const { flow, deps } = setup()
    await flow.signInWithRecoveryKey(KEY, 'turnstile-token')
    expect(deps.reload).not.toHaveBeenCalled()
    expect(flow.state().cloudSync).toBe(true)
  })
})

describe('signed out by the server', () => {
  it('shows why once after a wipe', async () => {
    const { flow, deps, mark } = setup()
    deps.mark.write({ ended: 'revoked' })
    await flow.resume(null)
    expect(flow.state().ended).toBe('revoked')
    expect(mark()).toBeNull()
  })

  it('forgets a stale reason once signed in', async () => {
    const { flow, deps, mark } = setup()
    deps.mark.write({ ended: 'reused' })
    await flow.resume(ACCOUNT)
    expect(flow.state().ended).toBeNull()
    expect(mark()).toBeNull()
  })
})
