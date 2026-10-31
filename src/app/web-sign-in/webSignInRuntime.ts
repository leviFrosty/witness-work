import { getRandomBytes } from 'expo-crypto'
import apis from '@/constants/apis'
import { webAccountKey } from '@/lib/accountKey/webAccountKey'
import { analytics } from '@/lib/analytics'
import { appVersion } from '@/lib/appUpdate'
import { createPasskey, getPasskey } from '@/lib/passkeys'
import { syncNow } from '@/lib/syncClock'
import {
  bearerOptions,
  fetchServerAccountInfo,
  thisDeviceLabel,
  webAccount,
} from '@/lib/serverAccount'
import { createBrowserApproval } from '@/lib/serverAccount/approvalSession'
import { deriveAccountSigningKey } from '@/lib/serverAccount/keys'
import { sealDeviceLabel } from '@/lib/serverAccount/deviceLabel'
import {
  addPasskey,
  finishPasskeySignIn,
  passkeyRegistrationOptions,
  type PasskeyResponseJSON,
  savePasskeyWrap,
  startPasskeySignIn,
  webRecovery,
} from '@/lib/serverAccount/passkeyClient'
import {
  addPasskeyFlow,
  type PasskeyAddResult,
} from '@/lib/serverAccount/passkeyFlow'
import { browserAndSystem } from '@/lib/serverAccount/webDeviceLabel'
import {
  createWebSignIn,
  type WebSignIn,
  type WebSignInEvent,
} from '@/lib/serverAccount/webSignIn'
import { webSignInMark } from '@/lib/serverAccount/webSignInMark'

/**
 * The web's sign-in flow (`webSignIn.ts`) on the real account, passkeys,
 * approval channel and analytics. Web only: the gate that imports it is.
 */

const signingOptions = (accountKey: Uint8Array) => ({
  baseUrl: apis.accounts,
  key: deriveAccountSigningKey(accountKey),
  now: syncNow,
  randomBytes: getRandomBytes,
})

function capture(event: WebSignInEvent) {
  switch (event.type) {
    case 'started':
      return analytics.capture('web_sign_in_started', { method: event.method })
    case 'succeeded':
      return analytics.capture('web_sign_in_succeeded', {
        method: event.method,
        after_passkey: event.afterPasskey,
        passkey_wrap: event.wrap,
      })
    case 'failed':
      return analytics.capture('web_sign_in_failed', {
        method: event.method,
        reason: event.reason,
      })
    case 'cantUnlock':
      return analytics.capture('web_sign_in_passkey_cant_unlock', {
        reason: event.reason,
        prf: event.prf,
      })
    case 'thatWasntMe':
      return analytics.capture('web_sign_in_that_wasnt_me')
  }
}

let flow: WebSignIn | null = null

/** The page's sign-in flow, made once. */
export function webSignIn(): WebSignIn {
  if (flow) return flow
  if (!webAccount) throw new Error('Web sign-in is web only')
  const account = webAccount
  flow = createWebSignIn({
    account,
    passkeys: {
      challenge: () => startPasskeySignIn({}, { baseUrl: apis.accounts }),
      get: getPasskey,
      assert: (args) => finishPasskeySignIn(args, { baseUrl: apis.accounts }),
      saveWrap: (accountKey, wrap) =>
        savePasskeyWrap(wrap, {
          ...bearerOptions(accountKey),
          sign: signingOptions(accountKey),
        }),
    },
    recovery: (accountKey, turnstileToken) =>
      webRecovery({ turnstileToken }, signingOptions(accountKey)),
    createApproval: () =>
      createBrowserApproval({
        baseUrl: apis.accounts,
        now: syncNow,
        randomBytes: getRandomBytes,
        origin: window.location.origin,
        hello: {
          ...browserAndSystem(navigator.userAgent),
          appVersion: appVersion() ?? '',
        },
      }),
    accountKey: () => webAccountKey.peek(),
    mark: webSignInMark,
    randomBytes: getRandomBytes,
    now: syncNow,
    onEvent: capture,
  })
  return flow
}

/**
 * Add a Passkey right after a phone approved this browser
 * (docs/passkeys-protocol.md, "On each side"): opening the session counted as
 * the step-up, so the passkey tap is the only check. Without PRF it's added
 * Sign-in only.
 */
export async function addPasskeyHere(): Promise<PasskeyAddResult> {
  const accountKey = await webAccountKey.peek()
  if (!accountKey)
    return { status: 'failed', step: 'options', reason: 'failed' }
  const signing = signingOptions(accountKey)
  const options = { ...bearerOptions(accountKey), sign: signing }
  // The RP ID this page's passkeys are for: its own host.
  const rpId = window.location.hostname
  analytics.capture('passkey_add_started', { kind: 'add' })
  const result = await addPasskeyFlow({
    server: {
      registrationOptions: () => passkeyRegistrationOptions({ rpId }, options),
      add: ({ response, ...args }) =>
        addPasskey(
          { ...args, response: response as unknown as PasskeyResponseJSON },
          options
        ),
      wrap: (args) => savePasskeyWrap(args, options),
      remove: async () => undefined,
      account: () => fetchServerAccountInfo(accountKey),
    },
    ceremonies: { create: createPasskey, get: getPasskey },
    confirmOwner: async () => 'confirmed',
    accountKey,
    rpId,
    randomBytes: getRandomBytes,
    label: () => {
      try {
        return sealDeviceLabel(
          accountKey,
          signing.key.publicKey,
          thisDeviceLabel(),
          getRandomBytes(12)
        )
      } catch {
        return undefined
      }
    },
  })
  if (result.status === 'added')
    analytics.capture('passkey_added', {
      kind: 'add',
      can_unlock: result.canUnlock,
      ...(!result.canUnlock && { sign_in_only: result.signInOnly }),
    })
  else
    analytics.capture('passkey_add_failed', {
      kind: 'add',
      step: result.step,
      reason: result.status === 'cancelled' ? 'cancelled' : result.reason,
    })
  return result
}
