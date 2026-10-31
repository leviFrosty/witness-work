import { AppState } from 'react-native'
import { getRandomBytes } from 'expo-crypto'
import apis from '@/constants/apis'
import { accountKey } from '@/app/account/accountKey'
import { analytics } from '@/lib/analytics'
import { confirmDeviceOwner } from '@/lib/deviceOwner'
import i18n from '@/lib/locales'
import { logger } from '@/lib/logger'
import {
  createPasskey,
  getPasskey,
  passkeySupport,
  type PasskeySupport,
} from '@/lib/passkeys'
import { PASSKEY_RP_ID } from '@/lib/passkeys/rpId'
import { syncNow } from '@/lib/syncClock'
import {
  bearerOptions,
  fetchServerAccountInfo,
  thisDeviceLabel,
} from '@/lib/serverAccount'
import { sealDeviceLabel } from '@/lib/serverAccount/deviceLabel'
import { deriveAccountSigningKey } from '@/lib/serverAccount/keys'
import {
  createDeviceLabelReader,
  type DeviceLabelReader,
} from '@/lib/serverAccount/activityLabels'
import {
  addPasskey,
  listPasskeys,
  type Passkey,
  type PasskeyClientOptions,
  passkeyRegistrationOptions,
  type PasskeyResponseJSON,
  removePasskey,
  savePasskeyWrap,
} from '@/lib/serverAccount/passkeyClient'
import {
  addPasskeyFlow,
  letPasskeyUnlockFlow,
  type PasskeyAddResult,
  type PasskeyCeremonies,
  type PasskeyFlowDeps,
  type PasskeyRemoveResult,
  type PasskeyUnlockResult,
  removePasskeyFlow,
} from '@/lib/serverAccount/passkeyFlow'
import { passkeyName } from '@/lib/serverAccount/passkeys'

/**
 * Settings → Account → Passkeys on phones (ADR 0038 §9): the account's
 * passkeys, adding one, letting a Sign-in-only one unlock, and removing one,
 * through this device's attested session and account key, with analytics.
 */

export class PasskeysNotSetUpError extends Error {
  constructor() {
    super('No account key on this device')
    this.name = 'PasskeysNotSetUpError'
  }
}

async function requireKey(): Promise<Uint8Array> {
  const key = await accountKey.peek()
  if (!key) throw new PasskeysNotSetUpError()
  return key
}

/**
 * Resolves once the app is active again. Face ID's sheet leaves it inactive for
 * a moment after it answers, and iOS presents a passkey sheet only from an
 * active scene ("No window to present from").
 */
function untilActive(timeoutMs = 3000): Promise<void> {
  if (AppState.currentState === 'active') return Promise.resolve()
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer)
      subscription.remove()
      resolve()
    }
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') done()
    })
    const timer = setTimeout(done, timeoutMs)
  })
}

/** The native module, posted without PRF output (`@/lib/passkeys`). */
const ceremonies: PasskeyCeremonies = {
  create: async (options) => {
    await untilActive()
    return createPasskey(options)
  },
  get: async (options) => {
    await untilActive()
    return getPasskey(options)
  },
}

function deps(key: Uint8Array): PasskeyFlowDeps {
  const signing = deriveAccountSigningKey(key)
  const options: PasskeyClientOptions = {
    ...bearerOptions(key),
    sign: {
      baseUrl: apis.accounts,
      key: signing,
      now: syncNow,
      randomBytes: getRandomBytes,
    },
  }
  return {
    server: {
      registrationOptions: () =>
        passkeyRegistrationOptions({ rpId: PASSKEY_RP_ID }, options),
      add: ({ response, ...args }) =>
        addPasskey(
          { ...args, response: response as unknown as PasskeyResponseJSON },
          options
        ),
      wrap: (args) => savePasskeyWrap(args, options),
      remove: (credentialId) => removePasskey(credentialId, options),
      account: () => fetchServerAccountInfo(key),
    },
    ceremonies,
    confirmOwner: () => confirmDeviceOwner(i18n.t('passkeys_unlockPrompt')),
    accountKey: key,
    rpId: PASSKEY_RP_ID,
    randomBytes: getRandomBytes,
    // PasskeyError carries the platform's message; never secrets.
    onError: (step, error) => logger.warn(`[passkeys] ${step} failed`, error),
    label: () => {
      try {
        return sealDeviceLabel(
          key,
          signing.publicKey,
          thisDeviceLabel(),
          getRandomBytes(12)
        )
      } catch {
        // A label is optional; never fail adding a passkey over it.
        return undefined
      }
    },
  }
}

export type LoadedPasskeys = {
  passkeys: Passkey[]
  /** `WitnessWork <tag>`; null until the account's first passkey. */
  name: string | null
  readLabel: DeviceLabelReader
}

/** The account's passkeys, newest first, and how to read their labels. */
export async function loadPasskeys(): Promise<LoadedPasskeys> {
  const key = await requireKey()
  const list = await listPasskeys(bearerOptions(key))
  return {
    passkeys: list.passkeys,
    name: list.userHandle ? passkeyName(list.userHandle) : null,
    readLabel: createDeviceLabelReader(key),
  }
}

/** Whether this phone can make passkeys at all, so Add a Passkey shows. */
export const phonePasskeySupport = (): Promise<PasskeySupport> =>
  passkeySupport()

type AddKind = 'add' | 'upgrade'

function reportAdd(
  kind: AddKind,
  result: PasskeyAddResult | PasskeyUnlockResult
) {
  if (result.status === 'added' || result.status === 'unlocks') {
    analytics.capture('passkey_added', {
      kind,
      can_unlock: result.status === 'unlocks' || result.canUnlock,
      ...(result.status === 'added' &&
        !result.canUnlock && { sign_in_only: result.signInOnly }),
    })
    return
  }
  analytics.capture('passkey_add_failed', {
    kind,
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

/** Add a Passkey, start to end. */
export async function addPhonePasskey(context: {
  count: number
  support: PasskeySupport | null
}): Promise<PasskeyAddResult> {
  analytics.capture('passkey_add_started', { kind: 'add' })
  const result = await addPasskeyFlow(deps(await requireKey()), {
    count: context.count,
    support: context.support ?? undefined,
  })
  reportAdd('add', result)
  return result
}

/** Let It Unlock, for a Sign-in-only passkey. */
export async function letPhonePasskeyUnlock(
  credentialId: string
): Promise<PasskeyUnlockResult> {
  analytics.capture('passkey_add_started', { kind: 'upgrade' })
  const result = await letPasskeyUnlockFlow(
    deps(await requireKey()),
    credentialId
  )
  reportAdd('upgrade', result)
  return result
}

/** Remove, once the User confirmed the warning. */
export async function removePhonePasskey(
  passkey: Passkey,
  lastUnlocking: boolean
): Promise<PasskeyRemoveResult> {
  const result = await removePasskeyFlow(
    deps(await requireKey()),
    passkey.credentialId
  )
  if (result.status === 'removed')
    analytics.capture('passkey_removed', {
      can_unlock: passkey.canUnlock,
      last_unlocking: lastUnlocking,
    })
  else if (result.status === 'failed')
    logger.warn(`[passkeys] remove failed: ${result.reason}`)
  return result
}
