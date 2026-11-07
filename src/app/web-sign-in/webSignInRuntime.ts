import { getRandomBytes } from 'expo-crypto'
import apis from '@/constants/apis'
import { webAccountKey } from '@/lib/accountKey/webAccountKey'
import { analytics } from '@/lib/analytics'
import { appVersion } from '@/lib/appUpdate'
import { createPasskey, getPasskey } from '@/lib/passkeys'
import { syncNow } from '@/lib/syncClock'
import { bearerOptions, webAccount } from '@/lib/serverAccount'
import { createBrowserApproval } from '@/lib/serverAccount/approvalSession'
import { deriveAccountSigningKey } from '@/lib/serverAccount/keys'
import {
  finishPasskeySignIn,
  savePasskeyWrap,
  startPasskeySignIn,
  webRecovery,
} from '@/lib/serverAccount/passkeyClient'
import type { PasskeyAddResult } from '@/lib/serverAccount/passkeyFlow'
import {
  addWebPasskey,
  type WebPasskeyStepUp,
} from '@/lib/serverAccount/webPasskeyAdd'
import {
  accountPasskeyDeps,
  type PasskeyAddSource,
  reportPasskeyAdd,
} from '@/lib/serverAccount/passkeyServer'
import { browserAndSystem } from '@/lib/serverAccount/webDeviceLabel'
import {
  createWebSignIn,
  type WebSignIn,
  type WebSignInEvent,
} from '@/lib/serverAccount/webSignIn'
import { webSignInMark } from '@/lib/serverAccount/webSignInMark'

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

export async function addPasskeyHere(
  context: { source?: PasskeyAddSource; stepUp?: WebPasskeyStepUp } = {}
): Promise<PasskeyAddResult> {
  const accountKey = await webAccountKey.peek()
  if (!accountKey)
    return { status: 'failed', step: 'options', reason: 'failed' }
  const { options: _, ...account } = accountPasskeyDeps(accountKey)
  return addWebPasskey(
    {
      ...account,
      ceremonies: { create: createPasskey, get: getPasskey },
      randomBytes: getRandomBytes,
    },
    {
      stepUp: context.stepUp ?? {
        holds: () => webSignIn().addPasskeyAllowed(),
        confirm: async () =>
          webSignIn().addPasskeyAllowed() ? 'confirmed' : 'failed',
      },
      source: context.source ?? 'approved_by',
      track: {
        started: (source) =>
          analytics.capture('passkey_add_started', { kind: 'add', source }),
        finished: (source, result) => reportPasskeyAdd('add', source, result),
      },
    }
  )
}
