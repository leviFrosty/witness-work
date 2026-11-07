import { getRandomBytes } from 'expo-crypto'
import apis from '@/constants/apis'
import { webAccountKey } from '@/lib/accountKey/webAccountKey'
import { analytics } from '@/lib/analytics'
import { appVersion } from '@/lib/appUpdate'
import { createPasskey, getPasskey } from '@/lib/passkeys'
import { PASSKEY_RP_ID } from '@/lib/passkeys/rpId'
import { syncNow } from '@/lib/syncClock'
import { webAccount } from '@/lib/serverAccount'
import { sealDeviceLabel } from '@/lib/serverAccount/deviceLabel'
import { deriveAccountSigningKey } from '@/lib/serverAccount/keys'
import {
  finishPasskeySignIn,
  startPasskeySignIn,
  webSignup,
  webSignupOptions,
} from '@/lib/serverAccount/passkeyClient'
import { closeSession } from '@/lib/serverAccount/sessionClient'
import { webDeviceLabel } from '@/lib/serverAccount/webDeviceLabel'
import {
  createWebSignUp,
  type WebSignUp,
  type WebSignUpEvent,
  type WebSignUpLock,
  createWebSignUpMarkStore,
  WEB_SIGN_UP_LOCK,
} from '@/lib/serverAccount/webSignUp'
import { DATA_OWNER_KEY } from '@/lib/webStorage/boot'
import { secureKv } from '@/lib/webStorage/secureKv'

const mark = createWebSignUpMarkStore(secureKv)

const lock: WebSignUpLock = async (run) => {
  const locks = typeof navigator === 'undefined' ? undefined : navigator.locks
  if (!locks?.request) {
    await run()
    return true
  }
  return locks.request(
    WEB_SIGN_UP_LOCK,
    { ifAvailable: true },
    async (held) => {
      if (!held) return false
      await run()
      return true
    }
  )
}

function rpId(): string {
  const host = globalThis.location?.hostname ?? PASSKEY_RP_ID
  return host === PASSKEY_RP_ID || host.endsWith(`.${PASSKEY_RP_ID}`)
    ? PASSKEY_RP_ID
    : host
}

type SignalingCredential = {
  signalUnknownCredential?: (options: {
    rpId: string
    credentialId: string
  }) => Promise<void>
}

function signalUnknownPasskey(rpId: string, credentialId: string) {
  const brands = (
    navigator as Navigator & {
      userAgentData?: { brands?: { brand: string }[] }
    }
  ).userAgentData?.brands
  if (!brands?.some(({ brand }) => brand === 'Chromium')) return
  const signal = (
    globalThis.PublicKeyCredential as unknown as SignalingCredential | undefined
  )?.signalUnknownCredential
  void signal?.({ rpId, credentialId }).catch(() => undefined)
}

const signingOptions = (accountKey: Uint8Array) => ({
  baseUrl: apis.accounts,
  key: deriveAccountSigningKey(accountKey),
  now: syncNow,
  randomBytes: getRandomBytes,
})

function sealedLabel(accountKey: Uint8Array): string | undefined {
  try {
    return sealDeviceLabel(
      accountKey,
      deriveAccountSigningKey(accountKey).publicKey,
      webDeviceLabel(),
      getRandomBytes(12)
    )
  } catch {
    return undefined
  }
}

function capture(event: WebSignUpEvent) {
  switch (event.type) {
    case 'started':
      return analytics.capture('web_sign_up_started')
    case 'completed':
      return analytics.capture('web_sign_up_completed', {
        prf: event.prf,
        after_lost_answer: event.finished,
      })
    case 'failed':
      return analytics.capture('web_sign_up_failed', {
        step: event.step,
        reason: event.reason,
      })
    case 'recoveryKeySaved':
      return analytics.capture('web_sign_up_recovery_key_saved')
  }
}

let flow: WebSignUp | null = null

export function webSignUp(): WebSignUp {
  if (flow) return flow
  if (!webAccount) throw new Error('Web sign-up is web only')
  flow = createWebSignUp({
    account: webAccount,
    accountKey: webAccountKey,
    server: {
      options: (turnstileToken) =>
        webSignupOptions({ turnstileToken }, { baseUrl: apis.accounts }),
      signup: (accountKey, request) =>
        webSignup(request, signingOptions(accountKey)),
      signInChallenge: () => startPasskeySignIn({}, { baseUrl: apis.accounts }),
      assert: (args) => finishPasskeySignIn(args, { baseUrl: apis.accounts }),
      closeOpened: (accessToken) =>
        closeSession(accessToken, { baseUrl: apis.accounts }),
    },
    owner: {
      read: async () => (await secureKv.get<string>(DATA_OWNER_KEY)) ?? null,
    },
    ceremonies: { create: createPasskey, get: getPasskey },
    signalUnknownPasskey,
    rpId,
    label: sealedLabel,
    isOnline: () =>
      typeof navigator === 'undefined' || navigator.onLine !== false,
    lock,
    appVersion: () => appVersion() ?? undefined,
    mark,
    randomBytes: getRandomBytes,
    onEvent: capture,
  })
  return flow
}
