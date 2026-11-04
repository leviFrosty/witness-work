import type { DeviceOwnerCheck } from '@/lib/deviceOwner'
import { HttpError } from '@/lib/http/request'
import type { SensitiveAction, StepUpResult } from '@/lib/serverAccount/stepUp'

/**
 * The shared check before sensitive actions (docs/passkeys-protocol.md, "The
 * shared check before sensitive actions"; ADR 0038 §8): showing the recovery
 * key, setting up or approving a device, adding or removing a passkey, changing
 * the account key, and deleting data.
 *
 * - **Phones:** Face ID, Touch ID or the passcode (`confirmDeviceOwner`), as
 *   before. Their sessions never need a step-up on the server.
 * - **The web:** a step-up the server checks, through the step-up sheet, which
 *   explains offline and no-passkey itself. Callers stop quietly on anything
 *   but `confirmed`.
 *
 * `withStepUp` runs a request the server gates (adding or removing a passkey,
 * `backup/delete`): on the web a 403 `step_up_required` runs the check and
 * retries once.
 */

export type { SensitiveAction }

export type SensitiveCheck =
  | DeviceOwnerCheck
  /** The web, offline: the check can't run, so the action waits. */
  | 'offline'
  /** The web, for an account with no passkey after its sign-in's 5 minutes. */
  | 'noPasskey'

/** The check before a retry didn't pass; nothing was retried. */
export class StepUpNotConfirmedError extends Error {
  constructor(readonly check: SensitiveCheck) {
    super(`step-up: ${check}`)
    this.name = 'StepUpNotConfirmedError'
  }
}

export type SensitiveCheckDeps = {
  /** The web's step-up, through its sheet; null on phones. */
  web: ((action: SensitiveAction) => Promise<StepUpResult>) | null
  confirmDeviceOwner: (promptMessage: string) => Promise<DeviceOwnerCheck>
}

/**
 * The check didn't pass and there's nothing more to say: cancelled, or on the
 * web, offline or no passkey, which the step-up sheet explained.
 */
export const stopsQuietly = (
  check: SensitiveCheck
): check is 'cancelled' | 'offline' | 'noPasskey' =>
  check === 'cancelled' || check === 'offline' || check === 'noPasskey'

export const isStepUpRequired = (error: unknown) =>
  error instanceof HttpError && error.serverCode === 'step_up_required'

/** A step-up's result as the shared check's. */
export function stepUpCheck(result: StepUpResult): SensitiveCheck {
  switch (result.status) {
    case 'confirmed':
      return 'confirmed'
    case 'offline':
    case 'noPasskey':
      return result.status
    case 'cancelled':
      return 'cancelled'
    case 'failed':
      return 'failed'
  }
}

export function createSensitiveCheck(deps: SensitiveCheckDeps) {
  /**
   * `confirm`, with the web's step-up (null on phones): how it passed, and
   * until when.
   */
  async function confirmStepUp(
    action: SensitiveAction,
    promptMessage: string
  ): Promise<{ check: SensitiveCheck; stepUp: StepUpResult | null }> {
    if (!deps.web)
      return {
        check: await deps.confirmDeviceOwner(promptMessage),
        stepUp: null,
      }
    const stepUp = await deps.web(action)
    return { check: stepUpCheck(stepUp), stepUp }
  }

  /**
   * Asks for a fresh check before `action`. `promptMessage` is what Face ID's
   * prompt says on phones; the web's sheet words its own.
   */
  const confirm = async (
    action: SensitiveAction,
    promptMessage: string
  ): Promise<SensitiveCheck> =>
    (await confirmStepUp(action, promptMessage)).check

  /**
   * Runs `op`; on the web, a refusal for want of a step-up runs the check and
   * `op` once more. Throws `StepUpNotConfirmedError` when the check doesn't
   * pass, and whatever `op` throws otherwise.
   */
  async function withStepUp<T>(
    action: SensitiveAction,
    op: () => Promise<T>
  ): Promise<T> {
    try {
      return await op()
    } catch (error) {
      if (!deps.web || !isStepUpRequired(error)) throw error
    }
    const check = stepUpCheck(await deps.web(action))
    if (check !== 'confirmed') throw new StepUpNotConfirmedError(check)
    return op()
  }

  return { confirm, confirmStepUp, withStepUp }
}

export type SensitiveCheckService = ReturnType<typeof createSensitiveCheck>
