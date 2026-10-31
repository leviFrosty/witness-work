import { HttpError } from '@/lib/http/request'
import {
  addPasskeyFlow,
  type PasskeyAddResult,
  type PasskeyFlowDeps,
} from '@/lib/serverAccount/passkeyFlow'
import type { PasskeyAddSource } from '@/lib/serverAccount/passkeyServer'
import type { CreateGate } from '@/lib/serverAccount/stepUpCreate'

/** A browser's owner check: `offline` when the server couldn't be asked. */
export type WebOwnerCheck = 'confirmed' | 'cancelled' | 'failed' | 'offline'

/**
 * The step-up Add a Passkey starts on in a browser: `holds` while the server
 * still counts it, `confirm` for the owner check (a passkey tap, or none while
 * it holds), and `beforeCreate`, the create's last word once the options are in
 * (`gateWebCreate`): a second tap when the check used the first, and the time
 * left. Without it, the create runs straight from the User's tap.
 */
export type WebPasskeyStepUp = {
  holds: () => boolean
  confirm: () => Promise<WebOwnerCheck>
  beforeCreate?: () => Promise<CreateGate>
}

/**
 * Add a Passkey in a browser (docs/passkeys-protocol.md, "Step-up on the web"):
 * the owner check is `stepUp`'s, and the authenticator never starts once the
 * step-up has run out, since `POST /passkeys` would refuse a passkey it had
 * already saved. Never throws.
 */
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
              ...(stepUp.beforeCreate && {
                beforeCreate: stepUp.beforeCreate,
                // A browser says the same for a cancel as for a create it
                // refused without a tap.
                createStopIsFailure: true,
              }),
            })
  track.finished(source, result)
  return result
}
