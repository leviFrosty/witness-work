import { Platform } from 'react-native'
import { confirmDeviceOwner } from '@/lib/deviceOwner'
import {
  createSensitiveCheck,
  type SensitiveAction,
  type SensitiveCheck,
} from '@/lib/sensitiveCheck'
import { requestStepUp } from '@/lib/serverAccount/stepUpPrompt'

const sensitiveCheck = createSensitiveCheck({
  web: Platform.OS === 'web' ? requestStepUp : null,
  confirmDeviceOwner,
})

export const confirmSensitiveAction = (
  action: SensitiveAction,
  promptMessage: string
): Promise<SensitiveCheck> => sensitiveCheck.confirm(action, promptMessage)

export const confirmSensitiveStepUp = (
  action: SensitiveAction,
  promptMessage: string
) => sensitiveCheck.confirmStepUp(action, promptMessage)

export const withStepUp = <T>(
  action: SensitiveAction,
  op: () => Promise<T>
): Promise<T> => sensitiveCheck.withStepUp(action, op)

export type { SensitiveAction, SensitiveCheck }
