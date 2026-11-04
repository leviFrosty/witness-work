import { useEffect, useRef, useState } from 'react'
import { View } from 'react-native'
import {
  CirclePause as CirclePauseIcon,
  Fingerprint as FingerprintIcon,
  UserPlus as UserPlusIcon,
} from 'lucide-react-native'
import InfoPopover from '@/components/ui/InfoPopover'
import InlineNotice from '@/components/ui/InlineNotice'
import Text from '@/components/ui/MyText'
import XView from '@/components/ui/layout/XView'
import useTheme from '@/contexts/theme'
import { fetchWebSignupConfig } from '@/lib/appUpdate'
import i18n from '@/lib/locales'
import type { WebSignUpState } from '@/lib/serverAccount/webSignUp'
import SignInButton from '@/app/web-sign-in/components/SignInButton'
import SignInPage from '@/app/web-sign-in/components/SignInPage'
import SecurityCheck from '@/app/web-sign-in/components/SecurityCheck'
import { signUpProblemText } from '@/app/web-sign-in/signInCopy'

/** Cloudflare's always-passing test key, for a dev build on an older worker. */
const TURNSTILE_TEST_SITE_KEY = '1x00000000000000000000AA'

type Config =
  | { status: 'loading' }
  | { status: 'ready'; siteKey: string }
  | { status: 'paused' }
  | { status: 'failed' }

/**
 * Create an Account on the web (docs/passkeys-protocol.md, "Signing up on the
 * web"): Turnstile solves while the page shows, then one button makes the
 * account and its passkey. Sign-up paused on the server says so instead, and a
 * sign-up whose answer was lost offers Finish with Passkey.
 */
export default function SignUpPage({
  state,
  onSubmit,
  onFinish,
  onPasskeyGone,
  onOnline,
  onBack,
}: {
  state: WebSignUpState
  onSubmit: (turnstileToken: string) => void
  onFinish: () => void
  /** "I Deleted That Passkey": the recovery key this browser holds instead. */
  onPasskeyGone: () => void
  /** The browser came back online: a problem from being offline goes. */
  onOnline: () => void
  /** None while finishing: Finish is the only way on. */
  onBack?: () => void
}) {
  const theme = useTheme()
  const [config, setConfig] = useState<Config>({ status: 'loading' })
  const [loadTry, setLoadTry] = useState(0)
  const [token, setToken] = useState<string | null>(null)
  const [resetKey, setResetKey] = useState(0)
  const problem = state.problem ? signUpProblemText(state.problem) : null

  useEffect(() => {
    if (state.finishing) return
    let cancelled = false
    setConfig({ status: 'loading' })
    fetchWebSignupConfig()
      .then((read) => {
        if (cancelled) return
        if (read?.enabled === false) return setConfig({ status: 'paused' })
        const siteKey =
          read?.turnstileSiteKey ?? (__DEV__ ? TURNSTILE_TEST_SITE_KEY : null)
        setConfig(siteKey ? { status: 'ready', siteKey } : { status: 'failed' })
      })
      .catch(() => {
        if (!cancelled) setConfig({ status: 'failed' })
      })
    return () => {
      cancelled = true
    }
  }, [state.finishing, loadTry])

  // Offline is only what the browser says; back online, try again.
  const offline = () =>
    typeof navigator !== 'undefined' && navigator.onLine === false
  const connectionProblem =
    state.problem?.failure === 'offline' ||
    state.problem?.failure === 'unreachable'
  const failedConfig = config.status === 'failed'
  useEffect(() => {
    if (typeof window === 'undefined') return
    const online = () => {
      if (connectionProblem) onOnline()
      if (failedConfig) setLoadTry((n) => n + 1)
    }
    window.addEventListener('online', online)
    return () => window.removeEventListener('online', online)
  }, [connectionProblem, failedConfig, onOnline])

  // A token works once: a new one for the next try.
  const tried = useRef(false)
  useEffect(() => {
    if (state.busy) tried.current = true
    else if (tried.current) {
      tried.current = false
      setResetKey((key) => key + 1)
    }
  }, [state.busy])

  if (state.finishing) {
    const picking = state.problem?.failure === 'pickPasskey'
    return (
      <SignInPage
        title={i18n.t('webSignUp_finishTitle')}
        icon={<FingerprintIcon size={36} color={theme.colors.accent} />}
      >
        <XView style={{ alignItems: 'center', justifyContent: 'center' }}>
          <Text style={[centered(theme), { flexShrink: 1 }]}>
            {i18n.t('webSignUp_finishBody')}
          </Text>
          <InfoPopover
            title={i18n.t('webSignUp_finishOnlyTitle')}
            description={i18n.t('webSignUp_finishOnlyInfo')}
            centered
          />
        </XView>
        {problem && (
          <View testID='web-sign-up-finish-problem'>
            <InlineNotice tone='error' message={problem} />
          </View>
        )}
        <SignInButton
          kind='primary'
          icon={FingerprintIcon}
          label={i18n.t('webSignUp_finish')}
          onPress={onFinish}
          loading={state.busy}
          testID='web-sign-up-finish'
        />
        {picking && (
          <SignInButton
            kind='text'
            label={i18n.t('webSignUp_passkeyDeleted')}
            onPress={onPasskeyGone}
            disabled={state.busy}
            testID='web-sign-up-passkey-deleted'
          />
        )}
      </SignInPage>
    )
  }

  if (config.status === 'paused' || state.problem?.failure === 'paused')
    return (
      <SignInPage
        title={i18n.t('webSignUp_pausedTitle')}
        icon={<CirclePauseIcon size={36} color={theme.colors.textAlt} />}
        onBack={onBack}
      >
        <Text style={centered(theme)} testID='web-sign-up-paused'>
          {i18n.t('webSignUp_pausedBody')}
        </Text>
      </SignInPage>
    )

  return (
    <SignInPage
      title={i18n.t('webSignUp_title')}
      icon={<UserPlusIcon size={36} color={theme.colors.accent} />}
      onBack={state.busy ? undefined : onBack}
    >
      <XView style={{ alignItems: 'center', justifyContent: 'center' }}>
        <Text style={[centered(theme), { flexShrink: 1 }]}>
          {i18n.t('webSignUp_body')}
        </Text>
        <InfoPopover
          title={i18n.t('webSignUp_title')}
          description={i18n.t('webSignUp_passkeyInfo')}
          centered
        />
      </XView>
      <View style={{ gap: 6 }}>
        <XView style={{ alignItems: 'center' }}>
          <Text
            style={{
              fontSize: theme.fontSize('sm'),
              color: theme.colors.textAlt,
            }}
          >
            {i18n.t('webSignIn_recoveryCheckLabel')}
          </Text>
          <InfoPopover
            title={i18n.t('webSignIn_recoveryCheckLabel')}
            description={i18n.t('webSignUp_checkInfo')}
            inline
          />
        </XView>
        {config.status === 'ready' ? (
          <SecurityCheck
            siteKey={config.siteKey}
            action='web-signup'
            resetKey={resetKey}
            onToken={setToken}
            testID='web-sign-up'
          />
        ) : config.status === 'loading' ? (
          <Text style={{ color: theme.colors.textAlt }}>
            {i18n.t('webSignIn_recoveryCheckLoading')}
          </Text>
        ) : (
          <View testID='web-sign-up-config-failed'>
            <InlineNotice
              message={i18n.t(
                offline()
                  ? 'webSignIn_problemOffline'
                  : 'webSignUp_problemUnreachable'
              )}
              onRetry={() => setLoadTry((n) => n + 1)}
            />
          </View>
        )}
      </View>
      {problem && (
        <InlineNotice
          tone='error'
          message={problem}
          style={{ alignSelf: 'stretch' }}
        />
      )}
      <SignInButton
        kind='primary'
        icon={FingerprintIcon}
        label={i18n.t('webSignUp_create')}
        onPress={() => {
          if (token && !state.busy) onSubmit(token)
        }}
        disabled={token === null || !state.ready}
        loading={state.busy}
        testID='web-sign-up-create'
      />
    </SignInPage>
  )
}

const centered = (theme: ReturnType<typeof useTheme>) => ({
  textAlign: 'center' as const,
  fontSize: theme.fontSize('md'),
  color: theme.colors.textAlt,
})
