import { getRandomBytes } from 'expo-crypto'
import apis from '@/constants/apis'
import { analytics } from '@/lib/analytics'
import { logger } from '@/lib/logger'
import { syncNow } from '@/lib/syncClock'
import {
  bearerOptions,
  fetchServerAccountInfo,
  thisDeviceLabel,
} from '@/lib/serverAccount'
import { sealDeviceLabel } from '@/lib/serverAccount/deviceLabel'
import { deriveAccountSigningKey } from '@/lib/serverAccount/keys'
import {
  addPasskey,
  type PasskeyClientOptions,
  passkeyRegistrationOptions,
  type PasskeyResponseJSON,
  removePasskey,
  savePasskeyWrap,
} from '@/lib/serverAccount/passkeyClient'
import type {
  PasskeyAddResult,
  PasskeyFlowDeps,
  PasskeyUnlockResult,
} from '@/lib/serverAccount/passkeyFlow'

export function accountPasskeyDeps(
  accountKey: Uint8Array,
  { rpId }: { rpId?: string } = {}
): Pick<PasskeyFlowDeps, 'server' | 'accountKey' | 'rpId' | 'label'> & {
  options: PasskeyClientOptions
} {
  const signing = deriveAccountSigningKey(accountKey)
  const options: PasskeyClientOptions = {
    ...bearerOptions(accountKey),
    sign: {
      baseUrl: apis.accounts,
      key: signing,
      now: syncNow,
      randomBytes: getRandomBytes,
    },
  }
  return {
    options,
    server: {
      registrationOptions: () => passkeyRegistrationOptions({ rpId }, options),
      add: ({ response, ...args }) =>
        addPasskey(
          { ...args, response: response as unknown as PasskeyResponseJSON },
          options
        ),
      wrap: (args) => savePasskeyWrap(args, options),
      remove: (credentialId) => removePasskey(credentialId, options),
      account: () => fetchServerAccountInfo(accountKey),
    },
    accountKey,
    ...(rpId && { rpId }),
    label: () => {
      try {
        return sealDeviceLabel(
          accountKey,
          signing.publicKey,
          thisDeviceLabel(),
          getRandomBytes(12)
        )
      } catch {
        return undefined
      }
    },
  }
}

export type PasskeyAddSource =
  | 'settings'
  | 'onboarding'
  | 'prompt'
  | 'approved_by'
  | 'key_change'

export function reportPasskeyAdd(
  kind: 'add' | 'upgrade',
  source: PasskeyAddSource,
  result: PasskeyAddResult | PasskeyUnlockResult
) {
  if (result.status === 'added' || result.status === 'unlocks') {
    analytics.capture('passkey_added', {
      kind,
      source,
      can_unlock: result.status === 'unlocks' || result.canUnlock,
      ...(result.status === 'added' &&
        !result.canUnlock && { sign_in_only: result.signInOnly }),
    })
    return
  }
  analytics.capture('passkey_add_failed', {
    kind,
    source,
    step: result.status === 'signInOnly' ? 'save' : result.step,
    reason:
      result.status === 'cancelled'
        ? 'cancelled'
        : result.status === 'signInOnly'
          ? result.signInOnly
          : result.reason,
  })
  if (result.status === 'failed')
    logger.warn(`[passkeys] ${kind} failed at ${result.step}: ${result.reason}`)
}
