import { randomBytes as nodeRandomBytes } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { HttpError } from '@/lib/http/request'
import { toCreatedPasskey, toPasskeyAssertion } from '@/lib/passkeys/prf'
import type {
  AuthenticationResponseJSON,
  RegistrationResponseJSON,
} from '@/lib/passkeys/types'
import { fetchAccountInfo } from '@/lib/serverAccount/client'
import { deriveAccountSigningKey } from '@/lib/serverAccount/keys'
import {
  addPasskey,
  finishPasskeySignIn,
  finishPasskeyStepUp,
  listPasskeys,
  passkeyRegistrationOptions,
  removePasskey,
  savePasskeyWrap,
  startPasskeySignIn,
  startPasskeyStepUp,
  webRecovery,
  webSignup,
  webSignupOptions,
  type PasskeyCeremonyOptions,
  type PasskeyResponseJSON,
} from '@/lib/serverAccount/passkeyClient'
import {
  addPasskeyFlow,
  type PasskeyFlowDeps,
  removePasskeyFlow,
} from '@/lib/serverAccount/passkeyFlow'
import {
  newPasskeyWrapId,
  openPasskeyWraps,
  passkeyName,
  wrapAccountKey,
} from '@/lib/serverAccount/passkeys'
import {
  interopAccount,
  interopEnabled,
  interopRelayUrl,
} from '@/lib/serverAccount/testing/interopSessions'
import { createSoftwarePasskey } from '@/lib/serverAccount/testing/softwarePasskey'

vi.mock('@/lib/logger', () => import('@/__tests__/mocks/logger'))

/**
 * Opt-in contract check of passkeys, web sign-up and web recovery against a
 * real worker (see `interopSessions`), with a software passkey on the dev
 * worker's `localhost` RP ID. Skipped by default. Sign-up and recovery use
 * Turnstile's test token, which the dev and local workers' test keys pass; both
 * count against the worker's per-IP caps.
 */
const baseUrl = interopRelayUrl!
const random = (length: number) => new Uint8Array(nodeRandomBytes(length))
const RP = { rpId: 'localhost', origin: 'http://localhost:8081' }
const TURNSTILE_TEST_TOKEN = 'XXXX.DUMMY.TOKEN.XXXX'

const code = async (run: () => Promise<unknown>) => {
  try {
    await run()
    return 'ok'
  } catch (error) {
    return error instanceof HttpError
      ? `${error.status} ${error.serverCode}`
      : String(error)
  }
}

async function signedIn() {
  const account = await interopAccount(random)
  const sign = {
    baseUrl,
    key: deriveAccountSigningKey(account.accountKey),
    now: Date.now,
    randomBytes: random,
  }
  return { ...account, both: { ...account.bearer, sign } }
}

describe.skipIf(!interopEnabled)('passkeys against a real worker', () => {
  it('adds a passkey as a phone does, can unlock, and removes it', async () => {
    const { accountKey, bearer, both } = await signedIn()
    const passkey = createSoftwarePasskey(random, RP)
    const deps: PasskeyFlowDeps = {
      server: {
        registrationOptions: () =>
          passkeyRegistrationOptions({ rpId: RP.rpId }, bearer),
        add: ({ response, ...args }) =>
          addPasskey(
            { ...args, response: response as unknown as PasskeyResponseJSON },
            both
          ),
        wrap: (args) => savePasskeyWrap(args, both),
        remove: (credentialId) => removePasskey(credentialId, both),
        account: () => fetchAccountInfo(bearer),
      },
      // The software passkey answers PRF only at sign-in, as some platforms do.
      ceremonies: {
        create: async (options) =>
          toCreatedPasskey(
            passkey.create(
              options as unknown as PasskeyCeremonyOptions
            ) as unknown as RegistrationResponseJSON
          ),
        get: async (options) =>
          toPasskeyAssertion(
            passkey.get(
              options as unknown as PasskeyCeremonyOptions
            ) as unknown as AuthenticationResponseJSON
          ),
      },
      confirmOwner: async () => 'confirmed',
      accountKey,
      rpId: RP.rpId,
      randomBytes: random,
    }

    expect(await addPasskeyFlow(deps, { count: 0 })).toEqual({
      status: 'added',
      credentialId: passkey.credentialId,
      canUnlock: true,
    })
    expect((await listPasskeys(bearer)).passkeys).toMatchObject([
      { credentialId: passkey.credentialId, canUnlock: true },
    ])

    expect(await removePasskeyFlow(deps, passkey.credentialId)).toEqual({
      status: 'removed',
    })
    expect((await listPasskeys(bearer)).passkeys).toEqual([])
  })

  it('adds a passkey, wraps the key, signs in and unlocks, and removes it', async () => {
    const { accountKey, accountId, bearer, both } = await signedIn()
    const passkey = createSoftwarePasskey(random, RP)

    const creation = await passkeyRegistrationOptions({ rpId: RP.rpId }, bearer)
    const user = creation.options.user as { id: string; name: string }
    expect(user.id).toBe(creation.userHandle)
    expect(user.name).toBe(passkeyName(creation.userHandle))
    expect(creation.options).not.toHaveProperty('extensions.prf')
    const { credentialId } = await addPasskey(
      {
        challengeToken: creation.challengeToken,
        response: passkey.create(creation.options),
      },
      both
    )
    expect(credentialId).toBe(passkey.credentialId)

    let list = await listPasskeys(bearer)
    expect(list.userHandle).toBe(creation.userHandle)
    expect(list.passkeys).toMatchObject([{ credentialId, canUnlock: false }])

    const wrap = {
      credentialId,
      wrapId: newPasskeyWrapId(random),
      keyEpoch: 0,
      wrap: wrapAccountKey(
        {
          prfOutput: passkey.prfOutput(),
          accountKey,
          accountId,
          credentialId,
          keyEpoch: 0,
        },
        random(24)
      ),
    }
    await savePasskeyWrap(wrap, both)
    // Repeating a wrap id stores nothing new.
    await savePasskeyWrap(wrap, both)
    // A wrap for another epoch is refused.
    expect(
      await code(() =>
        savePasskeyWrap(
          { ...wrap, wrapId: newPasskeyWrapId(random), keyEpoch: 1 },
          both
        )
      )
    ).toBe('409 conflict')
    list = await listPasskeys(bearer)
    expect(list.passkeys).toMatchObject([{ credentialId, canUnlock: true }])

    const challenge = await startPasskeySignIn({ rpId: RP.rpId }, { baseUrl })
    expect(challenge.options.allowCredentials ?? []).toEqual([])
    const response = passkey.get(challenge.options)
    const signIn = await finishPasskeySignIn(
      { challengeToken: challenge.challengeToken, response },
      { baseUrl }
    )
    expect(signIn).toMatchObject({
      accountId,
      accountPub: both.sign.key.publicKey,
      keyEpoch: 0,
      credentialId,
      userHandle: creation.userHandle,
    })
    expect(signIn.wraps).toHaveLength(1)
    // A web origin gets a ticket.
    expect(signIn.ticket).toEqual(expect.any(String))
    expect(
      openPasskeyWraps({ prfOutput: passkey.prfOutput(), ...signIn })
    ).toMatchObject({ ok: true, accountKey })

    // A challenge works once.
    expect(
      await code(() =>
        finishPasskeySignIn(
          { challengeToken: challenge.challengeToken, response },
          { baseUrl }
        )
      )
    ).toBe('403 passkey_failed')

    // A step-up on this session lists its passkeys.
    const stepUp = await startPasskeyStepUp({ rpId: RP.rpId }, bearer)
    expect(stepUp.options.allowCredentials).toMatchObject([
      { id: credentialId },
    ])
    expect(
      await finishPasskeyStepUp(
        {
          challengeToken: stepUp.challengeToken,
          response: passkey.get(stepUp.options),
        },
        bearer
      )
    ).toMatchObject({ credentialId })

    await removePasskey(credentialId, both)
    await removePasskey(credentialId, both)
    expect((await listPasskeys(bearer)).passkeys).toEqual([])
  })

  it('stores the same credential once, and refuses it for another account', async () => {
    const owner = await signedIn()
    const passkey = createSoftwarePasskey(random, RP)
    const creation = await passkeyRegistrationOptions(
      { rpId: RP.rpId },
      owner.bearer
    )
    const response = passkey.create(creation.options)
    await addPasskey(
      { challengeToken: creation.challengeToken, response },
      owner.both
    )
    const again = await passkeyRegistrationOptions(
      { rpId: RP.rpId },
      owner.bearer
    )
    expect(again.options.excludeCredentials).toMatchObject([
      { id: passkey.credentialId },
    ])
    // A lost answer: the same credential again is `ok`.
    expect(
      await addPasskey(
        {
          challengeToken: again.challengeToken,
          response: passkey.create(again.options),
        },
        owner.both
      )
    ).toEqual({ credentialId: passkey.credentialId })

    const stranger = await signedIn()
    const theirs = await passkeyRegistrationOptions(
      { rpId: RP.rpId },
      stranger.bearer
    )
    expect(
      await code(() =>
        addPasskey(
          {
            challengeToken: theirs.challengeToken,
            response: passkey.create(theirs.options),
          },
          stranger.both
        )
      )
    ).toBe('409 conflict')
    await removePasskey(passkey.credentialId, owner.both)
  })

  it('signs up on the web, then gets a recovery ticket for the key', async () => {
    const accountKey = random(32)
    const key = deriveAccountSigningKey(accountKey)
    const sign = { baseUrl, key, now: Date.now, randomBytes: random }
    const options = await webSignupOptions(
      { turnstileToken: TURNSTILE_TEST_TOKEN, rpId: RP.rpId },
      { baseUrl }
    )
    const passkey = createSoftwarePasskey(random, RP)
    const response = passkey.create(options.options)
    const signedUp = await webSignup(
      {
        challengeToken: options.challengeToken,
        response,
        wrapId: newPasskeyWrapId(random),
        wrap: wrapAccountKey(
          {
            prfOutput: passkey.prfOutput(),
            accountKey,
            accountId: options.accountId,
            credentialId: passkey.credentialId,
            keyEpoch: 0,
          },
          random(24)
        ),
        appVersion: '3.0.0',
      },
      sign
    )
    expect(signedUp).toMatchObject({
      accountId: options.accountId,
      credentialId: passkey.credentialId,
    })

    const recovery = await webRecovery(
      { turnstileToken: TURNSTILE_TEST_TOKEN },
      sign
    )
    expect(recovery.accountId).toBe(options.accountId)

    // A key without an account can't recover on the web.
    expect(
      await code(() =>
        webRecovery(
          { turnstileToken: TURNSTILE_TEST_TOKEN },
          { ...sign, key: deriveAccountSigningKey(random(32)) }
        )
      )
    ).toBe('404 unknown_account')
  })
})
