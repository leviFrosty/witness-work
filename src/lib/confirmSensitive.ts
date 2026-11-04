import { Platform } from 'react-native'
import { confirmDeviceOwner } from '@/lib/deviceOwner'
import {
  createSensitiveCheck,
  type SensitiveAction,
  type SensitiveCheck,
} from '@/lib/sensitiveCheck'
import { requestStepUp } from '@/lib/serverAccount/stepUpPrompt'

/**
 * The shared check before sensitive actions (`sensitiveCheck.ts`) on this
 * device: Face ID, Touch ID or the passcode on phones, the step-up sheet on the
 * web.
 */
const sensitiveCheck = createSensitiveCheck({
  web: Platform.OS === 'web' ? requestStepUp : null,
  confirmDeviceOwner,
})

/**
 * Asks for a fresh check before `action`. `promptMessage` is what the phone's
 * prompt says. Go ahead only on `confirmed`, or `noLock` on a phone with no
 * screen lock; on the web, the sheet already explained anything else.
 */
export const confirmSensitiveAction = (
  action: SensitiveAction,
  promptMessage: string
): Promise<SensitiveCheck> => sensitiveCheck.confirm(action, promptMessage)

/**
 * `confirmSensitiveAction`, with the web's step-up (null on phones): whether it
 * passed by a passkey or inside the server's window, and until when.
 */
export const confirmSensitiveStepUp = (
  action: SensitiveAction,
  promptMessage: string
) => sensitiveCheck.confirmStepUp(action, promptMessage)

/**
 * Runs a request the server gates behind a step-up; on the web, a 403
 * `step_up_required` asks for the check and retries once.
 */
export const withStepUp = <T>(
  action: SensitiveAction,
  op: () => Promise<T>
): Promise<T> => sensitiveCheck.withStepUp(action, op)

export type { SensitiveAction, SensitiveCheck }
