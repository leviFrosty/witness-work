import { useEffect, useRef, useState } from 'react'
import { Alert, Platform, TextInput as RNTextInput, View } from 'react-native'
import ActionButton from '@/components/ui/ActionButton'
import Sheet from '@/components/ui/Sheet'
import Text from '@/components/ui/MyText'
import TextInput from '@/components/ui/TextInput'
import useTheme from '@/contexts/theme'
import { accountKey, replaceAccountKey } from '@/app/account/accountKey'
import { platformKey } from '@/app/account/attestationCopy'
import { offerRestore } from '@/app/account/backupRestore'
import { analytics } from '@/lib/analytics'
import {
  losesSomething,
  type ReplaceAccountKeyResult,
} from '@/lib/accountKey/accountKey'
import {
  normalizeRecoveryKey,
  parseRecoveryKey,
  RECOVERY_KEY_LENGTH,
} from '@/lib/accountKey/recoveryKey'
import i18n from '@/lib/locales'
import { logger } from '@/lib/logger'
import { buddiesErrorMessage } from '@/features/buddies/lib/buddiesErrors'
import { BuddyRemovalPendingError } from '@/features/buddies/lib/engine'
import { RECOVERY_KEY_FONT } from '@/features/settings/components/account/recoveryKeyFont'
import { confirmAccountReplace } from '@/features/settings/components/account/confirmAccountReplace'
import useAttestationSupport from '@/features/settings/hooks/useAttestationSupport'

type Props = {
  open: boolean
  onClose: () => void

  onDone: () => void

  onRestored?: () => void
}

export default function UseRecoveryKeySheet(props: Props) {
  const theme = useTheme()
  const [busy, setBusy] = useState(false)

  const finished = useRef<ReplaceAccountKeyResult['outcome'] | null>(null)
  return (
    <Sheet
      open={props.open}
      onOpenChange={(open) => {
        if (!open) props.onClose()
      }}
      onClosed={() => {
        const outcome = finished.current
        finished.current = null
        if (!outcome) return
        props.onDone()
        if (outcome === 'unchanged')
          Alert.alert(
            i18n.t('account_sameKeyTitle'),
            i18n.t('account_sameKeyBody')
          )
        else
          Alert.alert(
            i18n.t('account_replacedTitle'),
            i18n.t('account_replacedBody'),
            [
              {
                text: i18n.t('ok'),
                onPress: () =>
                  void offerRestore('recovery_key')
                    .then((result) => {
                      if (result.outcome === 'restored') props.onRestored?.()
                    })
                    .catch((error: unknown) =>
                      logger.warn('[backup] restore offer failed', error)
                    ),
              },
            ]
          )
      }}
      dismissible={!busy}
      backgroundColor={theme.colors.card}
      testID='use-recovery-key-sheet'
    >
      <RecoveryKeyForm
        onFinished={(outcome) => {
          finished.current = outcome
          props.onClose()
        }}
        busy={busy}
        setBusy={setBusy}
      />
    </Sheet>
  )
}

function Unverifiable() {
  const theme = useTheme()
  useEffect(() => {
    analytics.capture('recovery_key_used', { outcome: 'unverified' })
  }, [])
  return (
    <View style={{ padding: 20, gap: 12 }} testID='recovery-key-unverified'>
      <Text
        accessibilityRole='header'
        style={{ fontSize: theme.fontSize('lg'), fontFamily: theme.fonts.bold }}
      >
        {i18n.t('account_unverifiedTitle')}
      </Text>
      <Text>
        {i18n.t(
          platformKey(
            'handoff_signInUnverified',
            'handoff_signInUnverifiedAndroid'
          )
        )}
      </Text>
    </View>
  )
}

function RecoveryKeyForm({
  onFinished,
  busy,
  setBusy,
}: {
  onFinished: (outcome: ReplaceAccountKeyResult['outcome']) => void
  busy: boolean
  setBusy: (busy: boolean) => void
}) {
  const theme = useTheme()
  const support = useAttestationSupport()
  const [value, setValue] = useState('')
  const input = useRef<RNTextInput>(null)
  const parsed = parseRecoveryKey(value)
  const typed = normalizeRecoveryKey(value).length

  useEffect(() => {
    if (Platform.OS !== 'android') return
    const timer = setTimeout(() => input.current?.focus(), 300)
    return () => clearTimeout(timer)
  }, [])

  const status: { text: string; tone: 'hint' | 'error' | 'ok' } = parsed.ok
    ? { text: i18n.t('account_enterValid'), tone: 'ok' }
    : parsed.problem === 'empty'
      ? { text: i18n.t('account_enterHint'), tone: 'hint' }
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

  const submit = async () => {
    if (!parsed.ok || busy) return
    const newKey = parsed.accountKey
    setBusy(true)
    try {
      const current = await accountKey.peek()
      const differs =
        current !== null &&
        (current.length !== newKey.length ||
          current.some((byte, i) => byte !== newKey[i]))
      const loss = await accountKey.lossIfReplaced(newKey)

      if (
        differs &&
        (losesSomething(loss) || Platform.OS === 'ios') &&
        !(await confirmAccountReplace(loss, 'recoveryKey'))
      ) {
        analytics.capture('recovery_key_used', { outcome: 'declined' })
        return
      }
      const result = await replaceAccountKey(newKey, {
        source: 'recovery_key',
        confirmedLoss: true,
      })
      analytics.capture('recovery_key_used', { outcome: result.outcome })
      onFinished(result.outcome)
    } catch (error) {
      logger.warn('Using a recovery key failed', error)
      analytics.capture('recovery_key_used', { outcome: 'failed' })
      Alert.alert(
        i18n.t('account_replaceFailedTitle'),

        error instanceof BuddyRemovalPendingError
          ? buddiesErrorMessage(error)
          : i18n.t('account_replaceFailedBody')
      )
    } finally {
      setBusy(false)
    }
  }

  if (support === 'unsupported') return <Unverifiable />

  return (
    <View style={{ padding: 20, gap: 12 }}>
      <Text
        accessibilityRole='header'
        style={{ fontSize: theme.fontSize('lg'), fontFamily: theme.fonts.bold }}
      >
        {i18n.t('account_enterTitle')}
      </Text>
      <TextInput
        ref={input}
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
        testID='recovery-key-input'
      />
      <Text
        accessibilityLiveRegion='polite'
        testID='recovery-key-status'
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
      <ActionButton
        onPress={submit}
        disabled={!parsed.ok}
        loading={busy}
        testID='recovery-key-submit'
      >
        {i18n.t('account_enterSubmit')}
      </ActionButton>
    </View>
  )
}
