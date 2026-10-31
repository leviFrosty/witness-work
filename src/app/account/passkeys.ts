import { AppState } from 'react-native'
import { getRandomBytes } from 'expo-crypto'
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
import { bearerOptions } from '@/lib/serverAccount'
import {
  createDeviceLabelReader,
  type DeviceLabelReader,
} from '@/lib/serverAccount/activityLabels'
import { listPasskeys, type Passkey } from '@/lib/serverAccount/passkeyClient'
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
import {
  accountPasskeyDeps,
  type PasskeyAddSource,
  reportPasskeyAdd,
} from '@/lib/serverAccount/passkeyServer'

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
  const { options: _, ...account } = accountPasskeyDeps(key, {
    rpId: PASSKEY_RP_ID,
  })
  return {
    ...account,
    ceremonies,
    confirmOwner: () => confirmDeviceOwner(i18n.t('passkeys_unlockPrompt')),
    randomBytes: getRandomBytes,
    // PasskeyError carries the platform's message; never secrets.
    onError: (step, error) => logger.warn(`[passkeys] ${step} failed`, error),
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

export type { PasskeyAddSource }

/**
 * Tools and the verify harness: the next Add a Passkey ends with this result
 * instead of opening the system's sheet. Cleared once used.
 */
let simulatedAdd: PasskeyAddResult | null = null
export function simulatePasskeyAdd(result: PasskeyAddResult | null) {
  simulatedAdd = result
}

/** Add a Passkey, start to end. */
export async function addPhonePasskey(context: {
  count: number
  support: PasskeySupport | null
  source: PasskeyAddSource
}): Promise<PasskeyAddResult> {
  analytics.capture('passkey_add_started', {
    kind: 'add',
    source: context.source,
  })
  const result =
    simulatedAdd ??
    (await addPasskeyFlow(deps(await requireKey()), {
      count: context.count,
      support: context.support ?? undefined,
    }))
  simulatedAdd = null
  reportPasskeyAdd('add', context.source, result)
  return result
}

/** Let It Unlock, for a Sign-in-only passkey. */
export async function letPhonePasskeyUnlock(
  credentialId: string
): Promise<PasskeyUnlockResult> {
  analytics.capture('passkey_add_started', {
    kind: 'upgrade',
    source: 'settings',
  })
  const result = await letPasskeyUnlockFlow(
    deps(await requireKey()),
    credentialId
  )
  reportPasskeyAdd('upgrade', 'settings', result)
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
