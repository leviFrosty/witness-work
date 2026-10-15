import { useEffect, useRef, useState } from 'react'
import { Alert, Platform, TextInput as RNTextInput, View } from 'react-native'
import ActionButton from '@/components/ui/ActionButton'
import Sheet from '@/components/ui/Sheet'
import Text from '@/components/ui/MyText'
import TextInput from '@/components/ui/TextInput'
import useTheme from '@/contexts/theme'
import { accountKey, replaceAccountKey } from '@/app/account/accountKey'
import { analytics } from '@/lib/analytics'
import {
  type AccountKeyLoss,
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
import { BuddyRemovalPendingError } from '@/features/buddies/lib/engine'
import { RECOVERY_KEY_FONT } from '@/features/settings/components/account/recoveryKeyFont'

type Props = {
  open: boolean
  onClose: () => void
  /** The key was used: this device's account changed (or already matched). */
  onDone: () => void
}

/**
 * Enter a recovery key to make its account this device's. Checks the key as
 * it's typed; when the key differs from this device's and Buddies has data
 * here, a destructive confirmation names what's lost first. Closing the sheet
 * cancels.
 */
export default function UseRecoveryKeySheet(props: Props) {
  const theme = useTheme()
  const [busy, setBusy] = useState(false)
  // Told once the sheet has closed, so the alert doesn't land mid-dismiss.
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
            i18n.t('account_replacedBody')
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

/** Asks before replacing; resolves whether to go ahead. */
function confirmReplace(loss: AccountKeyLoss): Promise<boolean> {
  const message = [
    loss.buddies > 0
      ? // @ts-expect-error TranslationKey doesn't handle keys that contain objects.
        i18n.t('account_replaceBuddies', { count: loss.buddies })
      : losesSomething(loss)
        ? i18n.t('account_replaceInbox')
        : null,
    Platform.OS === 'ios' ? i18n.t('account_replaceAppleDevices') : null,
  ]
    .filter(Boolean)
    .join('\n\n')
  return new Promise((resolve) =>
    Alert.alert(
      i18n.t('account_replaceTitle'),
      message,
      [
        {
          text: i18n.t('cancel'),
          style: 'cancel',
          onPress: () => resolve(false),
        },
        {
          text: i18n.t('account_replaceConfirm'),
          style: losesSomething(loss) ? 'destructive' : 'default',
          onPress: () => resolve(true),
        },
      ],
      { cancelable: true, onDismiss: () => resolve(false) }
    )
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
  const [value, setValue] = useState('')
  const input = useRef<RNTextInput>(null)
  const parsed = parseRecoveryKey(value)
  const typed = normalizeRecoveryKey(value).length

  // Android can't focus a field in a sheet that's still opening.
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
      // On iOS the key reaches every Apple device on the same iCloud
      // Keychain, so replacing one there always asks.
      if (
        differs &&
        (losesSomething(loss) || Platform.OS === 'ios') &&
        !(await confirmReplace(loss))
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
          ? i18n.t('buddies_deleteAllPending')
          : i18n.t('account_replaceFailedBody')
      )
    } finally {
      setBusy(false)
    }
  }

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
        textAlign='left'
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
