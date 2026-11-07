import { useEffect, useReducer, useRef } from 'react'
import { StyleSheet, View } from 'react-native'
import InlineNotice from '@/components/ui/InlineNotice'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import type { TurnstileAction } from '@/lib/turnstileFrame/protocol'
import Turnstile from '@/app/web-sign-in/components/Turnstile'
import {
  initialSecurityCheck,
  securityCheckReducer,
} from '@/app/web-sign-in/securityCheckState'

export default function SecurityCheck({
  siteKey,
  action,
  resetKey,
  onToken,
  testID,
}: {
  siteKey: string
  action: TurnstileAction

  resetKey: number
  onToken: (token: string | null) => void

  testID: string
}) {
  const theme = useTheme()
  const [state, dispatch] = useReducer(
    securityCheckReducer,
    initialSecurityCheck
  )

  const firstReset = useRef(resetKey)
  useEffect(() => {
    if (resetKey !== firstReset.current) dispatch({ type: 'reset' })
  }, [resetKey])

  const retry = () => {
    onToken(null)
    dispatch({ type: 'retry' })
  }
  const loading = state.status === 'loading'
  const failure = state.status === 'failed' ? state.failure : null

  return (
    <View style={{ gap: 6 }}>
      {failure !== 'load' && (
        <View style={{ width: '100%' }}>
          {}
          <View style={{ opacity: loading ? 0 : 1 }}>
            <Turnstile
              key={state.attempt}
              siteKey={siteKey}
              action={action}
              resetKey={resetKey}
              onToken={(token) => {
                onToken(token)
                if (token) dispatch({ type: 'token' })
              }}
              onReady={() => dispatch({ type: 'ready' })}
              onExpired={() => dispatch({ type: 'expired' })}
              onError={(reason) => dispatch({ type: 'failed', reason })}
            />
          </View>
          {loading && (
            <View
              style={[StyleSheet.absoluteFill, { justifyContent: 'center' }]}
              testID={`${testID}-check-loading`}
            >
              <Text style={{ color: theme.colors.textAlt }}>
                {i18n.t('webSignIn_recoveryCheckLoading')}
              </Text>
            </View>
          )}
        </View>
      )}
      {failure && (
        <View testID={`${testID}-check-failed`}>
          <InlineNotice
            tone='error'
            message={i18n.t(
              failure === 'load'
                ? 'webSignIn_checkLoadFailed'
                : 'webSignUp_checkFailed'
            )}
            onRetry={retry}
          />
        </View>
      )}
    </View>
  )
}
