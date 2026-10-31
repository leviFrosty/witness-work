import { randomBytes as nodeRandomBytes } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { toPasskeyAssertion } from '@/lib/passkeys/prf'
import type { AuthenticationResponseJSON } from '@/lib/passkeys/types'
import {
  createBrowserApproval,
  createPhoneApproval,
} from '@/lib/serverAccount/approvalSession'
import { deriveAccountSigningKey } from '@/lib/serverAccount/keys'
import {
  addPasskey,
  finishPasskeySignIn,
  listPasskeys,
  passkeyRegistrationOptions,
  savePasskeyWrap,
  startPasskeySignIn,
  webRecovery,
  type PasskeyCeremonyOptions,
} from '@/lib/serverAccount/passkeyClient'
import { newPasskeyWrapId, wrapAccountKey } from '@/lib/serverAccount/passkeys'
import { sendWebSessionOpen } from '@/lib/serverAccount/sessionClient'
import {
  interopAccount,
  interopEnabled,
  interopRelayUrl,
} from '@/lib/serverAccount/testing/interopSessions'
import { createSoftwarePasskey } from '@/lib/serverAccount/testing/softwarePasskey'
import { createWebSignIn } from '@/lib/serverAccount/webSignIn'
import type { WebSignInMark } from '@/lib/serverAccount/webSignInMark'

vi.mock('@/lib/logger', () => import('@/__tests__/mocks/logger'))

/**
 * Opt-in contract check of the web's sign-in flow against a real worker (see
 * `interopSessions`): a passkey that unlocks, one that signs in but can't and
 * is finished by a recovery key (and then unlocks), a recovery key with
 * Turnstile's test token, and a phone's approval. The browser's account is a
 * plain web session here, not IndexedDB. Skipped by default; recovery counts
 * against the worker's per-IP cap.
 */
const baseUrl = interopRelayUrl!
const random = (length: number) => new Uint8Array(nodeRandomBytes(length))
const ORIGIN = 'http://localhost:8081'
const RP = { rpId: 'localhost', origin: ORIGIN }
const TURNSTILE_TEST_TOKEN = 'XXXX.DUMMY.TOKEN.XXXX'

const sign = (accountKey: Uint8Array) => ({
  baseUrl,
  key: deriveAccountSigningKey(accountKey),
  now: Date.now,
  randomBytes: random,
})

/** A phone's account with a software passkey, wrapped for it or not. */
async function phoneWithPasskey({ wrapped }: { wrapped: boolean }) {
  const phone = await interopAccount(random)
  const both = { ...phone.bearer, sign: sign(phone.accountKey) }
  const passkey = createSoftwarePasskey(random, RP)
  const creation = await passkeyRegistrationOptions(
    { rpId: RP.rpId },
    phone.bearer
  )
  const { credentialId } = await addPasskey(
    {
      challengeToken: creation.challengeToken,
      response: passkey.create(creation.options),
    },
    both
  )
  if (wrapped)
    await savePasskeyWrap(
      {
        credentialId,
        wrapId: newPasskeyWrapId(random),
        keyEpoch: 0,
        wrap: wrapAccountKey(
          {
            prfOutput: passkey.prfOutput(),
            accountKey: phone.accountKey,
            accountId: phone.accountId,
            credentialId,
            keyEpoch: 0,
          },
          random(24)
        ),
      },
      both
    )
  return { phone, passkey, credentialId }
}

/** The flow over a browser whose "account" is a web session in memory. */
function browser(passkey?: ReturnType<typeof createSoftwarePasskey>) {
  let mark: WebSignInMark | null = null
  const sessions: { accountId: string; accessToken: string }[] = []
  const flow = createWebSignIn({
    account: {
      openWebSessionWithTicket: async (ticket, accountKey, options) => {
        const opened = await sendWebSessionOpen(
          { ticket, appVersion: '9.9.9' },
          sign(accountKey)
        )
        if (options?.expectAccountId)
          expect(opened.accountId).toBe(options.expectAccountId)
        sessions.push(opened)
        return { ...opened, reload: false }
      },
      signOut: async () => undefined,
    },
    passkeys: {
      challenge: () => startPasskeySignIn({ rpId: RP.rpId }, { baseUrl }),
      get: async (options) =>
        toPasskeyAssertion(
          passkey!.get(
            options as unknown as PasskeyCeremonyOptions
          ) as unknown as AuthenticationResponseJSON
        ),
      assert: (args) => finishPasskeySignIn(args, { baseUrl }),
      saveWrap: (accountKey, wrap) =>
        savePasskeyWrap(wrap, {
          baseUrl,
          authorize: (run) => run(`Bearer ${sessions.at(-1)!.accessToken}`),
          sign: sign(accountKey),
        }),
    },
    recovery: (accountKey, turnstileToken) =>
      webRecovery({ turnstileToken }, sign(accountKey)),
    createApproval: () =>
      createBrowserApproval({
        baseUrl,
        now: Date.now,
        randomBytes: random,
        origin: ORIGIN,
        hello: { browser: 'Chrome', system: 'macOS', appVersion: '9.9.9' },
      }),
    accountKey: async () => null,
    mark: {
      read: () => mark,
      write: (next) => {
        mark = next
      },
    },
    randomBytes: random,
    now: Date.now,
  })
  return { flow, sessions }
}

describe.skipIf(!interopEnabled)('web sign-in against a real worker', () => {
  it('signs in with a passkey that unlocks', async () => {
    const { phone, passkey } = await phoneWithPasskey({ wrapped: true })
    const { flow, sessions } = browser(passkey)
    await flow.signInWithPasskey()
    expect(flow.state()).toMatchObject({ problem: null, cantUnlock: null })
    expect(sessions.map((session) => session.accountId)).toEqual([
      phone.accountId,
    ])
  })

  it('finishes a passkey that can’t unlock with the recovery key, then it unlocks', async () => {
    const { phone, passkey, credentialId } = await phoneWithPasskey({
      wrapped: false,
    })
    const first = browser(passkey)
    await first.flow.signInWithPasskey()
    expect(first.flow.state().cantUnlock).toEqual({
      reason: 'noWraps',
      prf: true,
    })
    // Another account's key is refused before anything is sent.
    await first.flow.signInWithRecoveryKey(random(32), TURNSTILE_TEST_TOKEN)
    expect(first.flow.state().problem?.failure).toBe('wrongAccount')
    expect(first.sessions).toEqual([])

    await first.flow.signInWithRecoveryKey(phone.accountKey, null)
    expect(first.flow.state()).toMatchObject({
      problem: null,
      wrapSaved: true,
    })
    expect(first.sessions).toHaveLength(1)
    expect((await listPasskeys(phone.bearer)).passkeys).toMatchObject([
      { credentialId, canUnlock: true },
    ])

    const next = browser(passkey)
    await next.flow.signInWithPasskey()
    expect(next.flow.state()).toMatchObject({ problem: null, cantUnlock: null })
    expect(next.sessions.map((session) => session.accountId)).toEqual([
      phone.accountId,
    ])
  })

  it('signs in with a recovery key and the security check', async () => {
    const phone = await interopAccount(random)
    const { flow, sessions } = browser()
    await flow.signInWithRecoveryKey(phone.accountKey, TURNSTILE_TEST_TOKEN)
    expect(flow.state().problem).toBeNull()
    expect(sessions.map((session) => session.accountId)).toEqual([
      phone.accountId,
    ])
  })

  it('says when no account has the recovery key', async () => {
    const { flow, sessions } = browser()
    await flow.signInWithRecoveryKey(random(32), TURNSTILE_TEST_TOKEN)
    expect(flow.state().problem?.failure).toBe('unknownAccount')
    expect(sessions).toEqual([])
  })

  it('signs in with a phone’s approval', async () => {
    const phone = await interopAccount(random)
    const { flow, sessions } = browser()
    const approval = flow.startPhone()
    await vi.waitFor(() => expect(approval.state.step).toBe('showing'))
    const link = (approval.state as { link: string }).link
    const phoneSide = createPhoneApproval(
      link,
      {
        accountKey: phone.accountKey,
        accountId: phone.accountId,
        deviceName: 'Interop Phone',
        authorize: phone.bearer.authorize,
      },
      { baseUrl, now: Date.now, randomBytes: random, origins: [ORIGIN] }
    )
    await phoneSide.claim()
    await vi.waitFor(() => expect(approval.state.step).toBe('claimed'), {
      timeout: 10_000,
    })
    await phoneSide.approve()
    await vi.waitFor(
      () => expect(flow.state().approvedBy).toBe('Interop Phone'),
      { timeout: 10_000 }
    )
    expect(approval.state.step).toBe('done')
    expect(sessions.map((session) => session.accountId)).toEqual([
      phone.accountId,
    ])
  })
})
