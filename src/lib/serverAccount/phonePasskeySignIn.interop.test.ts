import { randomBytes as nodeRandomBytes } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { toPasskeyAssertion } from '@/lib/passkeys/prf'
import type { AuthenticationResponseJSON } from '@/lib/passkeys/types'
import { deriveAccountSigningKey } from '@/lib/serverAccount/keys'
import {
  addPasskey,
  finishPasskeySignIn,
  listPasskeys,
  passkeyRegistrationOptions,
  savePasskeyWrap,
  startPasskeySignIn,
  type PasskeyCeremonyOptions,
} from '@/lib/serverAccount/passkeyClient'
import { newPasskeyWrapId, wrapAccountKey } from '@/lib/serverAccount/passkeys'
import { createPhonePasskeySignIn } from '@/lib/serverAccount/phonePasskeySignIn'
import {
  interopAccount,
  interopEnabled,
  interopRelayUrl,
  interopSessions,
} from '@/lib/serverAccount/testing/interopSessions'
import { createSoftwarePasskey } from '@/lib/serverAccount/testing/softwarePasskey'

vi.mock('@/lib/logger', () => import('@/__tests__/mocks/logger'))

const baseUrl = interopRelayUrl!
const random = (length: number) => new Uint8Array(nodeRandomBytes(length))
const RP = {
  rpId: 'app-dev.witnesswork.app',
  origin: 'android:apk-key-hash:-sYXRdwJA3hvue3mKpYrOZ9zSPC7b4mbgzJmdZEDO5w',
}

const sign = (accountKey: Uint8Array) => ({
  baseUrl,
  key: deriveAccountSigningKey(accountKey),
  now: Date.now,
  randomBytes: random,
})

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

async function newPhone(passkey: ReturnType<typeof createSoftwarePasskey>) {
  let current: Uint8Array | null = random(32)
  const tickets: unknown[] = []
  const flow = createPhonePasskeySignIn({
    passkeys: {
      challenge: () => startPasskeySignIn({ rpId: RP.rpId }, { baseUrl }),
      get: async (options) =>
        toPasskeyAssertion(
          passkey.get(
            options as unknown as PasskeyCeremonyOptions
          ) as unknown as AuthenticationResponseJSON
        ),
      assert: async (args) => {
        const answer = await finishPasskeySignIn(args, { baseUrl })
        tickets.push(answer.ticket)
        return answer
      },
    },
    account: {
      openDetached: (key, call) =>
        interopSessions(random, key).openDetached(key, call),
      current: async () => current,
      lastAccountId: () => null,
      lossIfReplaced: async () => ({
        buddies: 0,
        buddyNames: [],
        inboxRegistered: false,
        keptElsewhere: false,
      }),
      replace: async (key, session) => {
        await session.adopt()
        current = key
        return {
          outcome: 'replaced',
          loss: {
            buddies: 0,
            buddyNames: [],
            inboxRegistered: false,
            keptElsewhere: false,
          },
          accountId: session.accountId,
          sameAccount: false,
        }
      },
    },
    confirmReplace: async () => true,
    wrapServer: (key) => {
      const sessions = interopSessions(random, key)
      const options = {
        baseUrl,
        authorize: <T>(run: (authorization: string) => Promise<T>) =>
          sessions.withSession(run, { accountKey: key }),
        sign: sign(key),
      }
      return {
        account: async () => {
          const { accountId } = await sessions.ensure(key)
          return {
            accountId,
            accountPub: deriveAccountSigningKey(key).publicKey,
            keyEpoch: 0,
          }
        },
        wrap: (args) => savePasskeyWrap(args, options),
      }
    },
    randomBytes: random,
  })
  return { flow, current: () => current, tickets }
}

describe.skipIf(!interopEnabled)(
  'phone passkey sign-in against a real worker',
  () => {
    it('unlocks with a wrapped passkey, with no ticket for an Android origin', async () => {
      const { phone, passkey } = await phoneWithPasskey({ wrapped: true })
      const device = await newPhone(passkey)
      await expect(device.flow.signIn()).resolves.toEqual({
        status: 'unlocked',
        replaced: 'replaced',
        rejoined: false,
      })
      expect(device.current()).toEqual(phone.accountKey)
      expect(device.tickets).toEqual([undefined])
    })

    it('signs in but can’t unlock, saves its wrap once the key arrives, then unlocks', async () => {
      const { phone, passkey, credentialId } = await phoneWithPasskey({
        wrapped: false,
      })
      const device = await newPhone(passkey)
      await expect(device.flow.signIn()).resolves.toEqual({
        status: 'cantUnlock',
        reason: 'noWraps',
        prf: true,
      })

      await expect(device.flow.keyArrived(phone.accountKey)).resolves.toBe(
        'saved'
      )
      expect((await listPasskeys(phone.bearer)).passkeys).toMatchObject([
        { credentialId, canUnlock: true },
      ])
      await expect(device.flow.signIn()).resolves.toMatchObject({
        status: 'unlocked',
      })
      expect(device.current()).toEqual(phone.accountKey)
    })
  }
)
