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

/**
 * The web's security check, for recovery-key sign-in and sign-up
 * (docs/web-turnstile.md): the Turnstile frame, "Loading…" until it first
 * speaks, and the app's own error with Try Again when the check fails, times
 * out or never comes up (Cloudflare's own Troubleshoot link can't open from the
 * sandboxed frame). An expired token draws a new check. `onToken` gets each
 * token, and null whenever there's none to use.
 */
export default function SecurityCheck({
  siteKey,
  action,
  resetKey,
  onToken,
  testID,
}: {
  siteKey: string
  action: TurnstileAction
  /** Change it after a token was used: each works once. */
  resetKey: number
  onToken: (token: string | null) => void
  /** Prefixes `-check-loading` and `-check-failed`. */
  testID: string
}) {
  const theme = useTheme()
  const [state, dispatch] = useReducer(
    securityCheckReducer,
    initialSecurityCheck
  )

  // A used token resets the frame: wait for the new one to speak.
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
          {/* Kept full size while it loads, so the widget renders as it would
              on screen; only hidden under the loading line. */}
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
