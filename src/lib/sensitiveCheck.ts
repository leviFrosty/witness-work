import type { DeviceOwnerCheck } from '@/lib/deviceOwner'
import { HttpError } from '@/lib/http/request'
import type { SensitiveAction, StepUpResult } from '@/lib/serverAccount/stepUp'

export type { SensitiveAction }

export type SensitiveCheck = DeviceOwnerCheck | 'offline' | 'noPasskey'

export class StepUpNotConfirmedError extends Error {
  constructor(readonly check: SensitiveCheck) {
    super(`step-up: ${check}`)
    this.name = 'StepUpNotConfirmedError'
  }
}

export type SensitiveCheckDeps = {
  web: ((action: SensitiveAction) => Promise<StepUpResult>) | null
  confirmDeviceOwner: (promptMessage: string) => Promise<DeviceOwnerCheck>
}

export const stopsQuietly = (
  check: SensitiveCheck
): check is 'cancelled' | 'offline' | 'noPasskey' =>
  check === 'cancelled' || check === 'offline' || check === 'noPasskey'

export const isStepUpRequired = (error: unknown) =>
  error instanceof HttpError && error.serverCode === 'step_up_required'

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

  const confirm = async (
    action: SensitiveAction,
    promptMessage: string
  ): Promise<SensitiveCheck> =>
    (await confirmStepUp(action, promptMessage)).check

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
