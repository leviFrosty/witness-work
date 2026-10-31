import { useSyncExternalStore } from 'react'
import { ActivityIndicator, useWindowDimensions, View } from 'react-native'
import QRCode from 'react-native-qrcode-svg'
import { Smartphone as SmartphoneIcon } from 'lucide-react-native'
import InfoPopover from '@/components/ui/InfoPopover'
import InlineNotice from '@/components/ui/InlineNotice'
import Text from '@/components/ui/MyText'
import XView from '@/components/ui/layout/XView'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import { localizeAppDigits } from '@/lib/numbers'
import type { BrowserApproval } from '@/lib/serverAccount/approvalSession'
import type { WebSignInState } from '@/lib/serverAccount/webSignIn'
import SignInButton from '@/app/web-sign-in/components/SignInButton'
import SignInPage from '@/app/web-sign-in/components/SignInPage'
import {
  approvalProblemText,
  signInProblemText,
} from '@/app/web-sign-in/signInCopy'

const MAX_QR = 260

/** `123456` as `123 456`. */
const spaced = (code: string) =>
  localizeAppDigits(`${code.slice(0, 3)} ${code.slice(3)}`)

/**
 * Use my phone: the approval QR, changing every minute, then the six-digit code
 * the phone shows too, then signing in (docs/passkeys-protocol.md, "Approving a
 * browser from a phone").
 */
export default function PhoneSignIn({
  approval,
  state,
  onRetry,
  onBack,
}: {
  approval: BrowserApproval
  state: WebSignInState
  /** A new approval, after this one ended. */
  onRetry: () => void
  onBack: () => void
}) {
  const theme = useTheme()
  const { width } = useWindowDimensions()
  const step = useSyncExternalStore(approval.subscribe, () => approval.state)
  const signingIn =
    step.step === 'received' ||
    step.step === 'finishing' ||
    step.step === 'done' ||
    state.busy === 'phone'
  const problem =
    state.problem?.method === 'phone'
      ? signInProblemText(state.problem, {
          afterPasskey: state.cantUnlock !== null,
        })
      : step.step === 'failed'
        ? approvalProblemText(step.reason)
        : step.step === 'cancelled'
          ? approvalProblemText('cancelled')
          : null

  const body = () => {
    if (problem && !signingIn)
      return (
        <>
          <InlineNotice tone='error' message={problem} />
          <SignInButton
            kind='primary'
            label={i18n.t('common_tryAgain')}
            onPress={onRetry}
            testID='web-sign-in-phone-retry'
          />
        </>
      )
    if (signingIn)
      return (
        <View style={{ alignItems: 'center', gap: 12 }}>
          <ActivityIndicator color={theme.colors.accent} />
          <Text style={{ color: theme.colors.textAlt }}>
            {i18n.t('webSignIn_signingIn')}
          </Text>
        </View>
      )
    switch (step.step) {
      case 'showing':
        return (
          <View style={{ alignItems: 'center', gap: 16 }}>
            <View
              accessible
              accessibilityRole='image'
              accessibilityLabel={i18n.t('webSignIn_phoneQrLabel')}
              testID='web-sign-in-qr'
              style={{
                padding: 16,
                borderRadius: theme.numbers.borderRadiusLg,
                backgroundColor: '#FFFFFF',
              }}
            >
              <QRCode
                value={step.link}
                size={Math.min(width - 96, MAX_QR)}
                color='#000000'
                backgroundColor='#FFFFFF'
                ecl='M'
              />
            </View>
            <XView style={{ alignItems: 'center' }}>
              <Text
                style={{
                  flexShrink: 1,
                  textAlign: 'center',
                  fontSize: theme.fontSize('md'),
                }}
              >
                {i18n.t('webSignIn_phoneScan')}
              </Text>
              <InfoPopover
                title={i18n.t('webSignIn_phone')}
                description={i18n.t('webSignIn_phoneScanInfo')}
                centered
              />
            </XView>
            <Text
              style={{
                fontSize: theme.fontSize('sm'),
                color: theme.colors.textAlt,
              }}
            >
              {i18n.t('webSignIn_phoneRotates')}
            </Text>
          </View>
        )
      case 'expired':
        return (
          <>
            <Text style={{ textAlign: 'center', color: theme.colors.textAlt }}>
              {i18n.t('webSignIn_phoneStopped')}
            </Text>
            <SignInButton
              kind='primary'
              label={i18n.t('webSignIn_phoneNewCode')}
              onPress={() => void approval.restart()}
              testID='web-sign-in-phone-new-code'
            />
          </>
        )
      case 'claimed':
        return (
          <View style={{ alignItems: 'center', gap: 16 }}>
            <Text
              accessibilityLabel={i18n.t('webSignIn_phoneCodeLabel', {
                code: step.code.split('').join(' '),
              })}
              testID='web-sign-in-phone-code'
              style={{
                fontSize: theme.fontSize('4xl'),
                fontFamily: theme.fonts.bold,
                fontVariant: ['tabular-nums'],
              }}
            >
              {spaced(step.code)}
            </Text>
            <XView style={{ alignItems: 'center' }}>
              <Text
                style={{
                  flexShrink: 1,
                  textAlign: 'center',
                  fontSize: theme.fontSize('md'),
                }}
              >
                {i18n.t('webSignIn_phoneClaimed')}
              </Text>
              <InfoPopover
                title={i18n.t('webSignIn_phone')}
                description={i18n.t('webSignIn_phoneClaimedInfo')}
                centered
              />
            </XView>
          </View>
        )
      default:
        return (
          <ActivityIndicator
            color={theme.colors.accent}
            style={{ minHeight: MAX_QR }}
          />
        )
    }
  }

  return (
    <SignInPage
      title={i18n.t('webSignIn_phone')}
      icon={
        step.step === 'showing' ? undefined : (
          <SmartphoneIcon size={36} color={theme.colors.accent} />
        )
      }
      onBack={signingIn ? undefined : onBack}
    >
      {body()}
    </SignInPage>
  )
}
