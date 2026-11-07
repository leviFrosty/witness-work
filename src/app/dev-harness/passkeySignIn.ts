import { Platform } from 'react-native'
import { getRandomBytes } from 'expo-crypto'
import { accountKey, replaceAccountKey } from '@/app/account/accountKey'
import { loadPasskeys, simulatePasskeyGet } from '@/app/account/passkeys'
import { pendingPasskeySignIn } from '@/app/account/passkeySignIn'
import { encodeRecoveryKey } from '@/lib/accountKey/recoveryKey'
import { PasskeyError, type PasskeyErrorCode } from '@/lib/passkeys/errors'
import { toPasskeyAssertion } from '@/lib/passkeys/prf'
import { PASSKEY_RP_ID } from '@/lib/passkeys/rpId'
import type { AuthenticationResponseJSON } from '@/lib/passkeys/types'
import { serverAccount } from '@/lib/serverAccount'
import { deriveAccountSigningKey } from '@/lib/serverAccount/keys'
import {
  addPasskey,
  passkeyRegistrationOptions,
  savePasskeyWrap,
} from '@/lib/serverAccount/passkeyClient'
import { newPasskeyWrapId, wrapAccountKey } from '@/lib/serverAccount/passkeys'
import { accountPasskeyDeps } from '@/lib/serverAccount/passkeyServer'
import { createSoftwarePasskey } from '@/lib/serverAccount/testing/softwarePasskey'

type SoftwarePasskey = ReturnType<typeof createSoftwarePasskey>

let software: SoftwarePasskey | null = null
let last: unknown = null

const origin = () =>
  Platform.select({
    android: 'android:apk-key-hash:-sYXRdwJA3hvue3mKpYrOZ9zSPC7b4mbgzJmdZEDO5w',
    default: `https://${PASSKEY_RP_ID}`,
  })

const tracked = (work: () => Promise<unknown>) => {
  last = null
  void work()
    .then((value) => {
      last = value ?? { done: true }
    })
    .catch((error: unknown) => {
      last = { error: String(error) }
    })
  return 'started'
}

async function seed(wrapped: boolean) {
  const key = await accountKey.getOrCreate()
  const { accountId } = await serverAccount.connect(key)
  const { options } = accountPasskeyDeps(key, { rpId: PASSKEY_RP_ID })
  const passkey = createSoftwarePasskey(getRandomBytes, {
    rpId: PASSKEY_RP_ID,
    origin: origin(),
  })
  const creation = await passkeyRegistrationOptions(
    { rpId: PASSKEY_RP_ID },
    options
  )
  const { credentialId } = await addPasskey(
    {
      challengeToken: creation.challengeToken,
      response: passkey.create(creation.options),
    },
    options
  )
  if (wrapped)
    await savePasskeyWrap(
      {
        credentialId,
        wrapId: newPasskeyWrapId(getRandomBytes),
        keyEpoch: 0,
        wrap: wrapAccountKey(
          {
            prfOutput: passkey.prfOutput(),
            accountKey: key,
            accountId,
            credentialId,
            keyEpoch: 0,
          },
          getRandomBytes(24)
        ),
      },
      options
    )
  software = passkey
  return {
    accountId,
    accountPub: deriveAccountSigningKey(key).publicKey,
    recoveryKey: encodeRecoveryKey(key),
    credentialId,
    wrapped,
  }
}

export const passkeySignInHarness = {
  seedSoftware: ({ wrapped = true }: { wrapped?: boolean } = {}) =>
    tracked(() => seed(wrapped)),
  switchAccount: () =>
    tracked(async () => {
      const key = getRandomBytes(32)
      await replaceAccountKey(key, { source: 'tools', confirmedLoss: true })
      return { accountPub: deriveAccountSigningKey(key).publicKey }
    }),
  useSoftware: ({ prf = true }: { prf?: boolean } = {}) => {
    const passkey = software
    if (!passkey) return 'seed first'
    simulatePasskeyGet(async (options) => {
      const response = passkey.get(
        options as unknown as Parameters<SoftwarePasskey['get']>[0]
      ) as unknown as AuthenticationResponseJSON
      const assertion = toPasskeyAssertion(response)
      if (!prf) {
        assertion.prf?.fill(0)
        return { ...assertion, prf: null }
      }
      return assertion
    })
    return prf ? 'software' : 'software without prf'
  },
  mockGet: (code: PasskeyErrorCode | null) => {
    simulatePasskeyGet(
      code
        ? async () => {
            throw new PasskeyError(code, 'verify harness')
          }
        : null
    )
    return code ?? 'system'
  },
  pending: () => pendingPasskeySignIn(),

  read: () =>
    tracked(async () => {
      const key = await accountKey.peek()
      const list = key ? await loadPasskeys().catch(() => null) : null
      return {
        accountPub: key ? deriveAccountSigningKey(key).publicKey : null,
        passkeys:
          list?.passkeys.map(({ credentialId, canUnlock }) => ({
            credentialId,
            canUnlock,
          })) ?? null,
      }
    }),
  get last() {
    return last
  },
}
