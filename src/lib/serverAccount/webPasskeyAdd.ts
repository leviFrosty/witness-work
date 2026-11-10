import { HttpError } from '@/lib/http/request'
import {
  addPasskeyFlow,
  type PasskeyAddResult,
  type PasskeyFlowDeps,
} from '@/lib/serverAccount/passkeyFlow'
import type { PasskeyAddSource } from '@/lib/serverAccount/passkeyServer'
import type { CreateGate } from '@/lib/serverAccount/stepUpCreate'

export type WebOwnerCheck = 'confirmed' | 'cancelled' | 'failed' | 'offline'

export type WebPasskeyStepUp = {
  holds: () => boolean
  confirm: () => Promise<WebOwnerCheck>
  beforeCreate?: () => Promise<CreateGate>
}

export async function addWebPasskey(
  deps: Omit<PasskeyFlowDeps, 'confirmOwner'>,
  {
    stepUp,
    source,
    track,
  }: {
    stepUp: WebPasskeyStepUp
    source: PasskeyAddSource
    track: {
      started: (source: PasskeyAddSource) => void
      finished: (source: PasskeyAddSource, result: PasskeyAddResult) => void
    }
  }
): Promise<PasskeyAddResult> {
  track.started(source)
  const owner = await stepUp.confirm().catch(() => 'failed' as const)
  const result: PasskeyAddResult =
    owner === 'cancelled'
      ? { status: 'cancelled', step: 'owner' }
      : owner === 'offline'
        ? { status: 'failed', step: 'owner', reason: 'offline' }
        : owner === 'failed'
          ? { status: 'failed', step: 'owner', reason: 'owner_failed' }
          : await addPasskeyFlow({
              ...deps,
              ceremonies: {
                ...deps.ceremonies,
                create: (options) =>
                  stepUp.holds()
                    ? deps.ceremonies.create(options)
                    : Promise.reject(
                        new HttpError('server', 403, 'step_up_required')
                      ),
              },
              confirmOwner: async () => 'confirmed',
              createStopIsFailure: true,
              ...(stepUp.beforeCreate && { beforeCreate: stepUp.beforeCreate }),
            })
  track.finished(source, result)
  return result
}
