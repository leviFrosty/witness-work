import { useEffect, useRef, useState } from 'react'
import { View } from 'react-native'
import { KeyRound as KeyRoundIcon } from 'lucide-react-native'
import InfoPopover from '@/components/ui/InfoPopover'
import InlineNotice from '@/components/ui/InlineNotice'
import Text from '@/components/ui/MyText'
import TextInput from '@/components/ui/TextInput'
import XView from '@/components/ui/layout/XView'
import useTheme from '@/contexts/theme'
import { fetchWebSignupConfig } from '@/lib/appUpdate'
import {
  normalizeRecoveryKey,
  parseRecoveryKey,
  RECOVERY_KEY_LENGTH,
} from '@/lib/accountKey/recoveryKey'
import i18n from '@/lib/locales'
import type { WebSignInState } from '@/lib/serverAccount/webSignIn'
import { RECOVERY_KEY_FONT } from '@/features/settings/components/account/recoveryKeyFont'
import SignInButton from '@/app/web-sign-in/components/SignInButton'
import SignInPage from '@/app/web-sign-in/components/SignInPage'
import Turnstile from '@/app/web-sign-in/components/Turnstile'
import { signInProblemText } from '@/app/web-sign-in/signInCopy'

/** Cloudflare's always-passing test key, for a dev build on an older worker. */
const TURNSTILE_TEST_SITE_KEY = '1x00000000000000000000AA'

type SiteKey =
  | { status: 'loading' }
  | { status: 'ready'; key: string }
  | {
      status: 'failed'
    }

/**
 * Use a Recovery Key on the web: the key, checked as it's typed, and Turnstile
 * solving meanwhile, unless a passkey's sign-in can still open the session.
 */
export default function RecoveryKeySignIn({
  state,
  needsCheck,
  onSubmit,
  onBack,
}: {
  state: WebSignInState
  /** Whether the security check is needed (`recoveryNeedsCheck`). */
  needsCheck: boolean
  onSubmit: (accountKey: Uint8Array, turnstileToken: string | null) => void
  onBack: () => void
}) {
  const theme = useTheme()
  const [value, setValue] = useState('')
  const [token, setToken] = useState<string | null>(null)
  const [resetKey, setResetKey] = useState(0)
  const [siteKey, setSiteKey] = useState<SiteKey>({ status: 'loading' })
  const [loadTry, setLoadTry] = useState(0)
  const parsed = parseRecoveryKey(value)
  const typed = normalizeRecoveryKey(value).length
  const busy = state.busy === 'recovery'
  const problem =
    state.problem?.method === 'recovery'
      ? signInProblemText(state.problem, {
          afterPasskey: state.cantUnlock !== null,
        })
      : null

  useEffect(() => {
    if (!needsCheck) return
    let cancelled = false
    setSiteKey({ status: 'loading' })
    fetchWebSignupConfig()
      .then((config) => {
        if (cancelled) return
        const key =
          config?.turnstileSiteKey ?? (__DEV__ ? TURNSTILE_TEST_SITE_KEY : null)
        setSiteKey(key ? { status: 'ready', key } : { status: 'failed' })
      })
      .catch(() => {
        if (!cancelled) setSiteKey({ status: 'failed' })
      })
    return () => {
      cancelled = true
    }
  }, [needsCheck, loadTry])

  // A token works once: a new one for the next try.
  const tried = useRef(false)
  useEffect(() => {
    if (busy) tried.current = true
    else if (tried.current && state.problem) {
      tried.current = false
      setResetKey((key) => key + 1)
    }
  }, [busy, state.problem])

  const status: { text: string; tone: 'hint' | 'error' | 'ok' } = parsed.ok
    ? { text: i18n.t('account_enterValid'), tone: 'ok' }
    : parsed.problem === 'empty'
      ? { text: i18n.t('webSignIn_recoveryHint'), tone: 'hint' }
      : parsed.problem === 'incomplete'
        ? {
            text: i18n.t('account_enterProgress', {
              count: typed,
              total: RECOVERY_KEY_LENGTH,
            }),
            tone: 'hint',
          }
        : {
            text: i18n.t(
              parsed.problem === 'character'
                ? 'account_enterCharacter'
                : parsed.problem === 'tooLong'
                  ? 'account_enterTooLong'
                  : 'account_enterChecksum'
            ),
            tone: 'error',
          }

  const ready = parsed.ok && (!needsCheck || token !== null)
  const submit = () => {
    if (!parsed.ok || !ready || busy) return
    onSubmit(parsed.accountKey, needsCheck ? token : null)
  }

  return (
    <SignInPage
      title={i18n.t('account_enterTitle')}
      icon={<KeyRoundIcon size={36} color={theme.colors.accent} />}
      onBack={busy ? undefined : onBack}
    >
      <View style={{ gap: 8 }}>
        <TextInput
          autoFocus
          multiline
          value={value}
          onChangeText={setValue}
          placeholder={i18n.t('account_enterPlaceholder')}
          accessibilityLabel={i18n.t('account_enterLabel')}
          autoCapitalize='characters'
          autoCorrect={false}
          autoComplete='off'
          spellCheck={false}
          invalid={status.tone === 'error'}
          textAlign='start'
          textAlignVertical='top'
          style={{
            minHeight: 88,
            fontFamily: RECOVERY_KEY_FONT,
            fontSize: theme.fontSize('md'),
          }}
          testID='web-sign-in-recovery-input'
        />
        <Text
          accessibilityLiveRegion='polite'
          testID='web-sign-in-recovery-status'
          style={{
            fontSize: theme.fontSize('sm'),
            color:
              status.tone === 'error'
                ? theme.colors.error
                : status.tone === 'ok'
                  ? theme.colors.accent
                  : theme.colors.textAlt,
          }}
        >
          {status.text}
        </Text>
      </View>
      {needsCheck && (
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
              description={i18n.t('webSignIn_recoveryCheckInfo')}
              inline
            />
          </XView>
          {siteKey.status === 'ready' ? (
            <Turnstile
              siteKey={siteKey.key}
              action='web-recovery'
              resetKey={resetKey}
              onToken={setToken}
              onError={() => setSiteKey({ status: 'failed' })}
            />
          ) : siteKey.status === 'loading' ? (
            <Text style={{ color: theme.colors.textAlt }}>
              {i18n.t('webSignIn_recoveryCheckLoading')}
            </Text>
          ) : (
            <InlineNotice
              message={i18n.t('webSignIn_problemOffline')}
              onRetry={() => setLoadTry((n) => n + 1)}
            />
          )}
        </View>
      )}
      {problem && (
        <InlineNotice
          tone='error'
          message={problem}
          style={{ alignSelf: 'stretch' }}
        />
      )}
      <SignInButton
        kind='primary'
        label={i18n.t('webSignIn_recoverySubmit')}
        onPress={submit}
        disabled={!ready}
        loading={busy}
        testID='web-sign-in-recovery-submit'
      />
    </SignInPage>
  )
}
