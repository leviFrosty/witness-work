import { View } from 'react-native'
import {
  Fingerprint as FingerprintIcon,
  KeyRound as KeyRoundIcon,
  Smartphone as SmartphoneIcon,
} from 'lucide-react-native'
import InfoPopover from '@/components/ui/InfoPopover'
import InlineNotice from '@/components/ui/InlineNotice'
import Text from '@/components/ui/MyText'
import XView from '@/components/ui/layout/XView'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import type { WebSignInState } from '@/lib/serverAccount/webSignIn'
import SignInButton from '@/app/web-sign-in/components/SignInButton'
import SignInPage from '@/app/web-sign-in/components/SignInPage'
import { signInProblemText } from '@/app/web-sign-in/signInCopy'

/**
 * The first page: a passkey, then the phone, then the recovery key (ADR 0038
 * §6), with why the server signed this browser out, or why the passkey couldn't
 * unlock.
 */
export default function SignInChoices({
  state,
  ended,
  keptData,
  onPasskey,
  onPhone,
  onRecoveryKey,
  onCreateAccount,
}: {
  state: WebSignInState
  ended: string | null
  /** The browser kept an account's data: signing in again picks it up. */
  keptData: boolean
  onPasskey: () => void
  onPhone: () => void
  onRecoveryKey: () => void
  /** None until web sign-up: accounts are made in the phone app. */
  onCreateAccount?: () => void
}) {
  const theme = useTheme()
  const problem =
    state.problem?.method === 'passkey'
      ? signInProblemText(state.problem)
      : null
  return (
    <SignInPage title={i18n.t('webSignIn_title')}>
      {ended && (
        <XView style={{ alignItems: 'center' }}>
          <InlineNotice tone='info' message={ended} style={{ flex: 1 }} />
          {keptData && (
            <InfoPopover
              title={i18n.t('webSignIn_title')}
              description={i18n.t('webSignIn_endedInfo')}
              centered
            />
          )}
        </XView>
      )}
      {state.cantUnlock && (
        <XView style={{ alignItems: 'center' }}>
          <InlineNotice
            tone='info'
            message={i18n.t('webSignIn_cantUnlock')}
            style={{ flex: 1 }}
          />
          <InfoPopover
            title={i18n.t('webSignIn_passkey')}
            description={i18n.t(
              state.cantUnlock.prf
                ? 'webSignIn_cantUnlockSaves'
                : 'webSignIn_cantUnlockNoPrf'
            )}
            centered
          />
        </XView>
      )}
      {problem && <InlineNotice tone='error' message={problem} />}
      <View style={{ gap: 12 }}>
        <SignInButton
          kind={state.cantUnlock ? 'secondary' : 'primary'}
          icon={FingerprintIcon}
          label={i18n.t('webSignIn_passkey')}
          onPress={onPasskey}
          loading={state.busy === 'passkey'}
          disabled={state.busy !== null && state.busy !== 'passkey'}
          testID='web-sign-in-passkey'
        />
        <SignInButton
          kind={state.cantUnlock ? 'primary' : 'secondary'}
          icon={SmartphoneIcon}
          label={i18n.t('webSignIn_phone')}
          onPress={onPhone}
          disabled={state.busy !== null}
          testID='web-sign-in-phone'
        />
        <SignInButton
          icon={KeyRoundIcon}
          label={i18n.t('webSignIn_recoveryKey')}
          onPress={onRecoveryKey}
          disabled={state.busy !== null}
          testID='web-sign-in-recovery'
        />
      </View>
      {!state.cantUnlock && (
        <View style={{ alignItems: 'center', paddingTop: 12 }}>
          <Text style={{ color: theme.colors.textAlt }}>
            {i18n.t('webSignIn_newHere')}
          </Text>
          {onCreateAccount ? (
            <SignInButton
              kind='text'
              label={i18n.t('webSignIn_createAccount')}
              onPress={onCreateAccount}
              disabled={state.busy !== null}
              testID='web-sign-in-create-account'
            />
          ) : (
            <Text
              style={{
                textAlign: 'center',
                fontSize: theme.fontSize('sm'),
                color: theme.colors.textAlt,
              }}
              testID='web-sign-in-create-in-app'
            >
              {i18n.t('webSignIn_createInApp')}
            </Text>
          )}
        </View>
      )}
    </SignInPage>
  )
}
