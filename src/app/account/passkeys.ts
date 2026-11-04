import { AppState, Platform } from 'react-native'
import { getRandomBytes } from 'expo-crypto'
import { accountKey } from '@/app/account/accountKey'
import { analytics } from '@/lib/analytics'
import {
  confirmSensitiveStepUp,
  type SensitiveAction,
  withStepUp,
} from '@/lib/confirmSensitive'
import i18n from '@/lib/locales'
import { logger } from '@/lib/logger'
import {
  createPasskey,
  getPasskey,
  passkeySupport,
  type PasskeySupport,
} from '@/lib/passkeys'
import { PASSKEY_RP_ID } from '@/lib/passkeys/rpId'
import { signalRemovedPasskey } from '@/lib/passkeys/signalUnknown'
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
import type { StepUpResult } from '@/lib/serverAccount/stepUp'
import { gateWebCreate } from '@/lib/serverAccount/stepUpCreate'
import {
  onPasskeyStepUp,
  pageClock,
  requestContinue,
} from '@/lib/serverAccount/stepUpPrompt'
import { keepListedWebLockPasskeys } from '@/lib/webAppLockRuntime'

/**
 * Settings → Account → Passkeys (ADR 0038 §9): the account's passkeys, adding
 * one, letting a Sign-in-only one unlock, and removing one, through this
 * device's session and account key, with analytics.
 *
 * Phones check Face ID, Touch ID or the passcode first. The web steps up
 * instead (`confirmSensitiveAction`), and a server that still asks for one
 * (`step_up_required`) gets it and the request once more (`withStepUp`). The
 * web sends no RP ID: the server picks the one its origin pairs with.
 */

const isWeb = Platform.OS === 'web'

/** The RP ID the web's last step-up named: where a removed passkey lives. */
let webRpId: string | null = null
if (isWeb)
  onPasskeyStepUp((result) => {
    webRpId = result.rpId
  })

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

function deps(key: Uint8Array, action: SensitiveAction): PasskeyFlowDeps {
  const { options: _, ...account } = accountPasskeyDeps(
    key,
    isWeb ? {} : { rpId: PASSKEY_RP_ID }
  )
  const { server } = account
  // The web's check and when the User tapped for it: the create that follows
  // must start inside its window, from a tap the browser still counts.
  let stepUp: StepUpResult | null = null
  let tappedAt = 0
  return {
    ...account,
    server: {
      ...server,
      add: (args) => withStepUp('add_passkey', () => server.add(args)),
      remove: (credentialId) =>
        withStepUp('remove_passkey', () => server.remove(credentialId)),
    },
    ceremonies,
    confirmOwner: async () => {
      tappedAt = isWeb ? pageClock() : 0
      const confirmed = await confirmSensitiveStepUp(
        action,
        i18n.t('passkeys_unlockPrompt')
      )
      stepUp = confirmed.stepUp
      return confirmed.check
    },
    ...(isWeb && {
      beforeCreate: () =>
        gateWebCreate(stepUp, tappedAt, {
          elapsed: pageClock,
          askContinue: (until) => requestContinue(action, until),
        }),
      createStopIsFailure: true,
    }),
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
  keepListedWebLockPasskeys(list.passkeys.map((p) => p.credentialId))
  return {
    passkeys: list.passkeys,
    name: list.userHandle ? passkeyName(list.userHandle) : null,
    readLabel: createDeviceLabelReader(key),
  }
}

/**
 * Whether this phone or browser can make passkeys at all, so Add a Passkey
 * shows.
 */
export const accountPasskeySupport = (): Promise<PasskeySupport> =>
  passkeySupport()

/**
 * The verify harness, in development builds only: sign-ins answer with this get
 * instead of the system's sheet (a software passkey, or a thrown
 * `PasskeyError`), until it's cleared with `null`.
 */
let simulatedGet: PasskeyCeremonies['get'] | null = null
export function simulatePasskeyGet(get: PasskeyCeremonies['get'] | null) {
  if (__DEV__) simulatedGet = get
}

/** A sign-in's get: the system's sheet, PRF evaluated. */
export const phonePasskeyGet: PasskeyCeremonies['get'] = (options) =>
  __DEV__ && simulatedGet ? simulatedGet(options) : ceremonies.get(options)

/**
 * Tools and the verify harness: the next Add a Passkey ends with this result
 * instead of opening the system's sheet. Cleared once used.
 */
let simulatedAdd: PasskeyAddResult | null = null
export function simulatePasskeyAdd(result: PasskeyAddResult | null) {
  simulatedAdd = result
}

/** Add a Passkey, start to end. */
export async function addAccountPasskey(context: {
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
    (await addPasskeyFlow(deps(await requireKey(), 'add_passkey'), {
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
    deps(await requireKey(), 'add_passkey'),
    credentialId
  )
  reportPasskeyAdd('upgrade', 'settings', result)
  return result
}

/** Remove, once the User confirmed the warning. */
export async function removeAccountPasskey(
  passkey: Passkey,
  lastUnlocking: boolean
): Promise<PasskeyRemoveResult> {
  const result = await removePasskeyFlow(
    deps(await requireKey(), 'remove_passkey'),
    passkey.credentialId
  )
  if (result.status === 'removed' && isWeb && webRpId)
    signalRemovedPasskey(webRpId, passkey.credentialId)
  if (result.status === 'removed')
    analytics.capture('passkey_removed', {
      can_unlock: passkey.canUnlock,
      last_unlocking: lastUnlocking,
    })
  else if (result.status === 'failed')
    logger.warn(`[passkeys] remove failed: ${result.reason}`)
  return result
}
