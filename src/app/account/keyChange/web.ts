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

export const KEY_CHANGE_SESSION_AGE_MS = 24 * 60 * 60 * 1000

export type WebKeyChangeDeps = {
  now: () => number

  elapsed: () => number

  wallNow: () => number
  randomBytes: (length: number) => Uint8Array

  devices: () => Promise<AccountDevice[]>
  passkeys: () => Promise<Pick<PasskeyList, 'passkeys'>>

  canLockTabs: () => boolean

  prepare: WebStepUp['prepare']

  requestStepUp: (action: SensitiveAction) => Promise<StepUpResult>

  requestContinue: (
    action: SensitiveAction,
    until: number
  ) => Promise<ContinueAnswer>
}

export const KEY_CHANGE_ADD_PASSKEY_MS = 4 * 60 * 1000

type NotPassed = Exclude<StepUpResult, { status: 'confirmed' }>

const FAILED: NotPassed = { status: 'failed', reason: 'failed' }

const SERVER_FAILURES: ReadonlySet<StepUpFailure> = new Set([
  'rate_limited',
  'unavailable',
  'update_required',
])

const unreachable = (result: NotPassed) =>
  result.status === 'offline' ||
  (result.status === 'failed' &&
    (result.reason === 'rate_limited' || result.reason === 'unavailable'))

function stepUpFailure(result: StepUpResult): KeyChangeError {
  if (result.status === 'offline') return new KeyChangeError('offline')

  if (result.status === 'failed' && SERVER_FAILURES.has(result.reason))
    return new KeyChangeError('server')

  return new KeyChangeError('step_up')
}

function sameCredential(a: string, b: string): boolean {
  try {
    return toB64u(fromB64u(a)) === toB64u(fromB64u(b))
  } catch {
    return false
  }
}

type Deadline = {
  page: number

  wallFrom: number
  wallUntil: number
}

export function createWebKeyChange(deps: WebKeyChangeDeps) {
  const deadline = (page: number): Deadline => {
    const wallFrom = deps.wallNow()
    return { page, wallFrom, wallUntil: wallFrom + (page - deps.elapsed()) }
  }

  const before = (at: Deadline | null) => {
    if (!at) return false
    const wall = deps.wallNow()
    return (
      deps.elapsed() < at.page && wall >= at.wallFrom && wall < at.wallUntil
    )
  }

  let changeStepUp: { startBy: Deadline; until: Deadline } | null = null

  function noteStepUp(result: StepUpPasskey) {
    const sentAt =
      result.until - (STEP_UP_WINDOW_MS - SESSION_STEP_UP_MARGIN_MS)
    changeStepUp = {
      startBy: deadline(sentAt + KEY_CHANGE_ADD_PASSKEY_MS),
      until: deadline(result.until),
    }
  }

  const stepUpHolds = () => before(changeStepUp?.startBy ?? null)

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

          return unreachable(result) ? 'offline' : 'failed'
        },
        beforeCreate: () =>
          gateWebCreate(before(until) ? result : null, tappedAt, {
            elapsed: deps.elapsed,
            askContinue: (at) => deps.requestContinue('add_passkey', at),
          }),
      }
    },

    async precheck(): Promise<void> {
      if (!deps.canLockTabs()) throw new KeyChangeError('unsupported')

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

    async passkeyUnlocks(): Promise<boolean> {
      const { passkeys } = await deps.passkeys()
      return passkeys.some((passkey) => passkey.canUnlock)
    },

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
