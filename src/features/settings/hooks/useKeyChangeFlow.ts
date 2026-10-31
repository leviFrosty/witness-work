import { useEffect, useState } from 'react'
import { Platform } from 'react-native'
import { keyChange } from '@/app/account/keyChange'
import { KeyChangeError } from '@/app/account/keyChange/engine'
import { encodeRecoveryKey } from '@/lib/accountKey/recoveryKey'
import { analytics } from '@/lib/analytics'
import { confirmDeviceOwner } from '@/lib/deviceOwner'
import i18n from '@/lib/locales'
import { logger } from '@/lib/logger'
import {
  createKeyChangeFlow,
  type KeyChangeFlow,
  type KeyChangeFlowState,
} from '@/features/settings/lib/keyChangeFlow'

/**
 * Change Account Key's flow for one visit to the screen: continues the change
 * under way when `resume`, and discards a new key nobody confirmed when the
 * screen goes away.
 */
export default function useKeyChangeFlow(resume: boolean): {
  flow: KeyChangeFlow
  state: KeyChangeFlowState
} {
  const [flow] = useState(() =>
    createKeyChangeFlow(
      {
        engine: keyChange,
        // A browser's check is the passkey the server asks for at the commit.
        confirmOwner: () =>
          Platform.OS === 'web'
            ? Promise.resolve('noLock' as const)
            : confirmDeviceOwner(i18n.t('accountKeyChange_unlockPrompt')),
        encodeRecoveryKey,
        failureReason: (error) => {
          if (error instanceof KeyChangeError) return error.reason
          logger.warn('[keyChange] the change stopped', error)
          return null
        },
        availableAt: (error) =>
          error instanceof KeyChangeError ? error.availableAt : undefined,
        track: (event, properties) => analytics.capture(event, properties),
      },
      { resuming: resume }
    )
  )
  const [state, setState] = useState(flow.state)

  useEffect(() => {
    const stop = flow.subscribe(setState)
    if (resume)
      void flow.resume().catch((error: unknown) => {
        logger.warn('[keyChange] continuing failed', error)
      })
    return () => {
      stop()
      void flow.leave().catch((error: unknown) => {
        logger.warn('[keyChange] discarding the new key failed', error)
      })
    }
  }, [flow, resume])

  return { flow, state }
}
