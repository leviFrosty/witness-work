import { fromB64u, toB64u } from '@/lib/bytes'
import type {
  WebOwnerCheck,
  WebPasskeyStepUp,
} from '@/lib/serverAccount/webPasskeyAdd'
import type { AccountDevice } from '@/lib/serverAccount/activityClient'
import type { PasskeyList } from '@/lib/serverAccount/passkeyClient'
import { newPasskeyWrapId, wrapAccountKey } from '@/lib/serverAccount/passkeys'
import type { RekeyPasskeyWrap } from '@/lib/serverAccount/keyChangeClient'
import {
  type SensitiveAction,
  SESSION_STEP_UP_MARGIN_MS,
  STEP_UP_WINDOW_MS,
  type StepUpFailure,
  type StepUpPasskey,
  type StepUpResult,
  type WebStepUp,
} from '@/lib/serverAccount/stepUp'
import { gateWebCreate } from '@/lib/serverAccount/stepUpCreate'
import type { ContinueAnswer } from '@/lib/serverAccount/stepUpPrompt'
import { KeyChangeError } from './engine'

/**
 * How long a browser's session must have been open before it may change the
 * account key (ADR 0039 §2). The server decides; the browser checks first, so
 * the User never saves a new recovery key it would refuse.
 */
export const KEY_CHANGE_SESSION_AGE_MS = 24 * 60 * 60 * 1000

/**
 * Changing the account key in a browser (ADR 0039 §2;
 * docs/account-key-change.md, step 3; docs/passkeys-protocol.md, "Step-up on
 * the web"): a session at least a day old, and a passkey tap the server checks
 * right after "I've saved it", whose PRF output wraps the new key so that
 * passkey unlocks the account again at once.
 *
 * The tap is the web's step-up sheet (`requestStepUp`), always with the passkey
 * for this action: the server's window after a sign-in or an earlier step-up
 * never stands in for it, since only a tap gives the PRF output. The sheet asks
 * for the challenge as it opens and runs the passkey prompt straight from its
 * own tap, which Safari asks for; it also records the check and tells App Lock
 * and Passkeys of it.
 */
export type WebKeyChangeDeps = {
  /** Server time (`syncNow`). */
  now: () => number
  /** The page's monotonic clock (`pageClock`), as the step-up's `until`. */
  elapsed: () => number
  /**
   * The wall clock (`Date.now`). The page's can stand still while the computer
   * sleeps; the server's window doesn't.
   */
  wallNow: () => number
  randomBytes: (length: number) => Uint8Array
  /** The account's sessions (`GET /sessions`); this browser's is `current`. */
  devices: () => Promise<AccountDevice[]>
  passkeys: () => Promise<Pick<PasskeyList, 'passkeys'>>
  /**
   * Whether the browser has Web Locks, which keep its tabs from carrying the
   * same change on at once.
   */
  canLockTabs: () => boolean
  /**
   * Which of the account's passkeys this page could step up with
   * (`webStepUp().prepare`): only those for the RP ID its origin pairs with.
   */
  prepare: WebStepUp['prepare']
  /** The step-up sheet (`requestStepUp`). */
  requestStepUp: (action: SensitiveAction) => Promise<StepUpResult>
  /** The sheet's second tap before a passkey's create (`requestContinue`). */
  requestContinue: (
    action: SensitiveAction,
    until: number
  ) => Promise<ContinueAnswer>
}

/**
 * How long after a step-up this browser may begin adding a passkey: the server
 * counts a step-up for 5 minutes, and the passkey prompt gets the last one (as
 * after "Approved by").
 */
export const KEY_CHANGE_ADD_PASSKEY_MS = 4 * 60 * 1000

/** A step-up that didn't pass: the server couldn't be asked, or it said no. */
type NotPassed = Exclude<StepUpResult, { status: 'confirmed' }>

const FAILED: NotPassed = { status: 'failed', reason: 'failed' }

/**
 * Step-up failures that are the server's, not the passkey check's. A plain
 * `failed` isn't one: the sheet says the same for a browser's failed prompt.
 */
const SERVER_FAILURES: ReadonlySet<StepUpFailure> = new Set([
  'rate_limited',
  'unavailable',
  'update_required',
])

/** The server couldn't be asked: offline, busy, or down. */
const unreachable = (result: NotPassed) =>
  result.status === 'offline' ||
  (result.status === 'failed' &&
    (result.reason === 'rate_limited' || result.reason === 'unavailable'))

/** Why the change's step-up stops it. */
function stepUpFailure(result: StepUpResult): KeyChangeError {
  if (result.status === 'offline') return new KeyChangeError('offline')
  // The server couldn't check it: not a check that didn't pass.
  if (result.status === 'failed' && SERVER_FAILURES.has(result.reason))
    return new KeyChangeError('server')
  // Cancelled, refused, no passkey here to tap, the browser's prompt failed,
  // or no tap at all.
  return new KeyChangeError('step_up')
}

/** The same credential id, however each side spelled its base64url. */
function sameCredential(a: string, b: string): boolean {
  try {
    return toB64u(fromB64u(a)) === toB64u(fromB64u(b))
  } catch {
    return false
  }
}

/** A deadline on both clocks: before it only while neither has passed it. */
type Deadline = {
  /** On the page's clock. */
  page: number
  /** On the wall clock, from when it was set. */
  wallFrom: number
  wallUntil: number
}

export function createWebKeyChange(deps: WebKeyChangeDeps) {
  const deadline = (page: number): Deadline => {
    const wallFrom = deps.wallNow()
    return { page, wallFrom, wallUntil: wallFrom + (page - deps.elapsed()) }
  }

  /** Whether `at` is still ahead on both clocks; a wall clock set back isn't. */
  const before = (at: Deadline | null) => {
    if (!at) return false
    const wall = deps.wallNow()
    return (
      deps.elapsed() < at.page && wall >= at.wallFrom && wall < at.wallUntil
    )
  }

  /**
   * The change's passkey step-up, once it passed: Add a Passkey may start on it
   * until `startBy`, and its create may run until `until`.
   */
  let changeStepUp: { startBy: Deadline; until: Deadline } | null = null

  function noteStepUp(result: StepUpPasskey) {
    // The server counts it from the assert, a little after `sentAt`.
    const sentAt =
      result.until - (STEP_UP_WINDOW_MS - SESSION_STEP_UP_MARGIN_MS)
    changeStepUp = {
      startBy: deadline(sentAt + KEY_CHANGE_ADD_PASSKEY_MS),
      until: deadline(result.until),
    }
  }

  /**
   * Whether the change's step-up still lets this browser start adding a
   * passkey.
   */
  const stepUpHolds = () => before(changeStepUp?.startBy ?? null)

  /**
   * Add a Passkey's owner check after a change: the change's step-up while it
   * holds, as the server's window (the User's Add a Passkey tap is still
   * fresh), else the sheet's own (`add_passkey`), the server's window or a
   * passkey tap.
   */
  async function confirmOwner(): Promise<{
    result: StepUpResult
    until: Deadline | null
  }> {
    if (changeStepUp && stepUpHolds())
      return {
        result: {
          status: 'confirmed',
          via: 'session',
          until: changeStepUp.until.page,
        },
        until: changeStepUp.until,
      }
    const result = await deps
      .requestStepUp('add_passkey')
      .catch((): StepUpResult => FAILED)
    return {
      result,
      until: result.status === 'confirmed' ? deadline(result.until) : null,
    }
  }

  return {
    stepUpHolds,

    /**
     * Add a Passkey after a change, one per try: the owner check
     * (`confirmOwner`), and the create's gate (`gateWebCreate`), which asks for
     * a second tap when a passkey's get used the first, or the first is too
     * old, and caps the create to the time the window has left.
     */
    addPasskeyStepUp(): WebPasskeyStepUp {
      let result: StepUpResult | null = null
      let until: Deadline | null = null
      let tappedAt = 0
      return {
        holds: () => before(until),
        async confirm(): Promise<WebOwnerCheck> {
          tappedAt = deps.elapsed()
          ;({ result, until } = await confirmOwner())
          if (result.status === 'confirmed') return 'confirmed'
          if (result.status === 'cancelled') return 'cancelled'
          // Not a check that failed: the server couldn't be asked.
          return unreachable(result) ? 'offline' : 'failed'
        },
        beforeCreate: () =>
          gateWebCreate(before(until) ? result : null, tappedAt, {
            elapsed: deps.elapsed,
            askContinue: (at) => deps.requestContinue('add_passkey', at),
          }),
      }
    },

    /**
     * Throws `unsupported`, `session_too_new` (with when it may) or
     * `no_passkey` when this browser can't change the key (yet), and `offline`
     * or `server` when it couldn't ask.
     */
    async precheck(): Promise<void> {
      if (!deps.canLockTabs()) throw new KeyChangeError('unsupported')
      // The step-up's challenge lists only the passkeys for this page's RP ID;
      // `GET /passkeys` would count those for another site too.
      const [devices, prepared] = await Promise.all([
        deps.devices(),
        deps.prepare('change_account_key'),
      ])
      const current = devices.find((device) => device.current)
      if (current && deps.now() - current.createdAt < KEY_CHANGE_SESSION_AGE_MS)
        throw new KeyChangeError('session_too_new', {
          availableAt: current.createdAt + KEY_CHANGE_SESSION_AGE_MS,
        })
      if (prepared.status === 'noPasskey')
        throw new KeyChangeError('no_passkey')
      if (prepared.status === 'offline') throw new KeyChangeError('offline')
      if (prepared.status === 'failed') throw new KeyChangeError('server')
    },

    /**
     * Whether one of the account's passkeys unlocks it now: after a change,
     * only the step-up's passkey does, and only when it gave PRF output.
     */
    async passkeyUnlocks(): Promise<boolean> {
      const { passkeys } = await deps.passkeys()
      return passkeys.some((passkey) => passkey.canUnlock)
    },

    /**
     * The step-up for a change to `newKey` at `keyEpoch` (the epoch it makes),
     * and the passkey's wrap of the new key when it gave PRF output.
     */
    async stepUp({
      newKey,
      accountId,
      keyEpoch,
    }: {
      newKey: Uint8Array
      accountId: string
      keyEpoch: number
    }): Promise<{ passkeyWrap?: RekeyPasskeyWrap }> {
      const passed = await deps
        .requestStepUp('change_account_key')
        .catch((): StepUpResult => FAILED)
      if (passed.status !== 'confirmed' || passed.via !== 'passkey')
        throw stepUpFailure(passed)
      noteStepUp(passed)
      const { assertion, credentialId } = passed
      if (!assertion.prf) return {}
      // The wrap is for the passkey whose PRF output made it, and only the one
      // the server verified: another's would never open.
      if (!sameCredential(assertion.response.rawId, credentialId)) return {}
      return {
        passkeyWrap: {
          credentialId,
          wrapId: newPasskeyWrapId(deps.randomBytes),
          wrap: wrapAccountKey(
            {
              accountId,
              credentialId,
              keyEpoch,
              prfOutput: assertion.prf,
              accountKey: newKey,
            },
            deps.randomBytes(24)
          ),
        },
      }
    },
  }
}
