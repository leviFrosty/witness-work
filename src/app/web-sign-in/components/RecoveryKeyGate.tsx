import { useEffect, useState } from 'react'
import { View } from 'react-native'
import * as Clipboard from 'expo-clipboard'
import {
  Copy as CopyIcon,
  Download as DownloadIcon,
  KeyRound as KeyRoundIcon,
  Printer as PrinterIcon,
  TriangleAlert as TriangleAlertIcon,
} from 'lucide-react-native'
import InlineNotice from '@/components/ui/InlineNotice'
import LucideIcon from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import { analytics } from '@/lib/analytics'
import i18n from '@/lib/locales'
import { logger } from '@/lib/logger'
import { toast } from '@/stores/toasts'
import { RecoveryKeyBox } from '@/features/settings/components/account/RecoveryKeySheet'
import SignInButton from '@/app/web-sign-in/components/SignInButton'
import type { WebSignUpState } from '@/lib/serverAccount/webSignUp'
import SignInPage from '@/app/web-sign-in/components/SignInPage'
import {
  clearPrintedRecoveryKey,
  downloadRecoveryKey,
  printRecoveryKey,
} from '@/app/web-sign-in/recoveryKeyExport'

type Method = 'download' | 'print' | 'copy'

const HELD_BODY = {
  passkeyGone: 'webSignUp_passkeyGoneBody',
  mayExist: 'webSignUp_mayExistBody',
  unreadable: 'webSignUp_heldKeyBody',
} as const

/**
 * After signing up on the web: the new account's recovery key, with Download,
 * Print and Copy, until the User says they saved it (docs/passkeys-protocol.md,
 * "Signing up on the web"). It reopens on every launch until then.
 *
 * `held`: signed out, the key this browser holds (`WebSignUpState.heldKey`),
 * shown so the User can save it, then sign in with it, which settles whether
 * its account exists. Clearing the site's data is the last resort.
 */
export default function RecoveryKeyGate({
  recoveryKey,
  signInOnly,
  onSaved,
  held,
  onPasskey,
  problem,
}: {
  recoveryKey: string
  /** The passkey can't unlock the account on its own. */
  signInOnly: boolean
  /** "I've saved it", or with `held`, Sign In with Recovery Key. */
  onSaved: () => Promise<void> | void
  held?: NonNullable<WebSignUpState['heldKey']>['why']
  /** With `held`, signing in with that account's passkey instead. */
  onPasskey?: () => void
  /** A sign-in that didn't finish, in one line. */
  problem?: string | null
}) {
  const theme = useTheme()
  const [saving, setSaving] = useState(false)
  // The printout's copy of the key never outlives the gate.
  useEffect(() => clearPrintedRecoveryKey, [])

  const exported = async (method: Method) => {
    try {
      if (method === 'download') downloadRecoveryKey(recoveryKey)
      else if (method === 'print') printRecoveryKey(recoveryKey)
      else {
        await Clipboard.setStringAsync(recoveryKey)
        toast.success(i18n.t('account_recoveryKeyCopied'))
      }
      analytics.capture('recovery_key_exported', { method })
    } catch (error) {
      logger.warn('[web sign-up] saving the recovery key failed', error)
      toast.error(i18n.t('webSignIn_problemFailed'))
    }
  }

  const action = (method: Method, label: string, icon: typeof CopyIcon) => (
    <View style={{ flexGrow: 1, flexBasis: 120 }}>
      <SignInButton
        icon={icon}
        label={label}
        onPress={() => void exported(method)}
        disabled={saving}
        testID={`web-sign-up-recovery-${method}`}
      />
    </View>
  )

  return (
    <SignInPage
      title={i18n.t(
        held === 'unreadable'
          ? 'webSignUp_heldKeyTitle'
          : 'webSignUp_recoveryTitle'
      )}
      icon={<KeyRoundIcon size={36} color={theme.colors.accent} />}
    >
      <Text
        style={{
          textAlign: 'center',
          fontSize: theme.fontSize('md'),
          color: theme.colors.textAlt,
        }}
      >
        {i18n.t(held ? HELD_BODY[held] : 'webSignUp_recoveryBody')}
      </Text>
      {problem && <InlineNotice tone='error' message={problem} />}
      {signInOnly && !held && (
        <View testID='web-sign-up-sign-in-only'>
          <InlineNotice
            tone='info'
            message={i18n.t('webSignUp_recoverySignInOnly')}
          />
        </View>
      )}
      <RecoveryKeyBox recoveryKey={recoveryKey} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
        {action('download', i18n.t('webSignUp_download'), DownloadIcon)}
        {action('print', i18n.t('webSignUp_print'), PrinterIcon)}
        {action('copy', i18n.t('copy'), CopyIcon)}
      </View>
      <View
        style={{
          flexDirection: 'row',
          gap: 10,
          padding: 12,
          borderRadius: theme.numbers.borderRadiusSm,
          backgroundColor: theme.colors.warnTranslucent,
        }}
      >
        <LucideIcon
          icon={TriangleAlertIcon}
          size={18}
          color={theme.colors.warnText}
        />
        <Text style={{ flex: 1, color: theme.colors.text }}>
          {i18n.t('account_recoveryKeyWarning')}
        </Text>
      </View>
      <SignInButton
        kind='primary'
        label={i18n.t(
          held ? 'webSignUp_signInWithRecoveryKey' : 'webSignUp_saved'
        )}
        loading={saving}
        onPress={() => {
          setSaving(true)
          void Promise.resolve(onSaved()).finally(() => setSaving(false))
        }}
        testID='web-sign-up-recovery-saved'
      />
      {held && onPasskey && (
        <SignInButton
          kind='text'
          label={i18n.t('webSignIn_passkey')}
          onPress={onPasskey}
          testID='web-sign-up-held-passkey'
        />
      )}
      {held && (
        <Text
          style={{
            textAlign: 'center',
            fontSize: theme.fontSize('sm'),
            color: theme.colors.textAlt,
          }}
          testID='web-sign-up-held-last-resort'
        >
          {i18n.t('webSignUp_heldKeyLastResort')}
        </Text>
      )}
    </SignInPage>
  )
}
