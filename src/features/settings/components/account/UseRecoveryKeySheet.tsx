import { useEffect, useRef, useState } from 'react'
import { Alert, Platform, TextInput as RNTextInput, View } from 'react-native'
import ActionButton from '@/components/ui/ActionButton'
import Sheet from '@/components/ui/Sheet'
import Text from '@/components/ui/MyText'
import TextInput from '@/components/ui/TextInput'
import useTheme from '@/contexts/theme'
import { accountKey, replaceAccountKey } from '@/app/account/accountKey'
import {
  attestationProblemBody,
  platformKey,
} from '@/app/account/attestationCopy'
import { offerRestore, recordsCameBack } from '@/app/account/backupRestore'
import { passkeyKeyArrived } from '@/app/account/passkeySignIn'
import { analytics } from '@/lib/analytics'
import {
  AccountKeyRetiredError,
  KeyChangeUnfinishedError,
  losesSomething,
  type ReplaceAccountKeyResult,
} from '@/lib/accountKey/accountKey'
import { formatDate } from '@/lib/dates'
import { serverAccount } from '@/lib/serverAccount'
import { AccountSessionError } from '@/lib/serverAccount/session'
import i18n from '@/lib/locales'
import { logger } from '@/lib/logger'
import { buddiesErrorMessage } from '@/features/buddies/lib/buddiesErrors'
import { BuddyRemovalPendingError } from '@/features/buddies/lib/engine'
import { RECOVERY_KEY_FONT } from '@/features/settings/components/account/recoveryKeyFont'
import { recoveryKeyStatus } from '@/features/settings/components/account/recoveryKeyStatus'
import { confirmAccountReplace } from '@/features/settings/components/account/confirmAccountReplace'
import { refuseWhileKeyChangeUnfinished } from '@/features/settings/components/account/keyChange/refuseWhileKeyChangeUnfinished'
import useAttestationSupport from '@/features/settings/hooks/useAttestationSupport'

type Props = {
  open: boolean
  onClose: () => void

  onDone: () => void

  onRestored?: () => void
}

type Finished = {
  outcome: ReplaceAccountKeyResult['outcome']

  sameAccount: boolean
}

export default function UseRecoveryKeySheet(props: Props) {
  const theme = useTheme()
  const [busy, setBusy] = useState(false)

  const finished = useRef<Finished | null>(null)
  return (
    <Sheet
      open={props.open}
      onOpenChange={(open) => {
        if (!open) props.onClose()
      }}
      onClosed={() => {
        const done = finished.current
        finished.current = null
        if (!done) return
        props.onDone()
        if (done.outcome === 'unchanged')
          Alert.alert(
            i18n.t('account_sameKeyTitle'),
            i18n.t('account_sameKeyBody')
          )
        else if (done.sameAccount)
          Alert.alert(
            i18n.t('account_rejoinedTitle'),
            i18n.t('account_rejoinedBody')
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
                      if (recordsCameBack(result)) props.onRestored?.()

                      if (result.outcome === 'synced' && result.combine)
                        Alert.alert(
                          i18n.t('handoff_newDoneTitle'),
                          i18n.t('handoff_newDoneSyncedCombine')
                        )
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
        onFinished={(done) => {
          finished.current = done
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

async function openSessionFor(newKey: Uint8Array) {
  try {
    return await accountKey.openSession(newKey)
  } catch (error) {
    if (error instanceof AccountSessionError && error.failure === 'unavailable')
      return undefined
    throw error
  }
}

function RecoveryKeyForm({
  onFinished,
  busy,
  setBusy,
}: {
  onFinished: (done: Finished) => void
  busy: boolean
  setBusy: (busy: boolean) => void
}) {
  const theme = useTheme()
  const support = useAttestationSupport()
  const [value, setValue] = useState('')
  const input = useRef<RNTextInput>(null)
  const { parsed, status } = recoveryKeyStatus(
    value,
    i18n.t('account_enterHint')
  )

  useEffect(() => {
    if (Platform.OS !== 'android') return
    const timer = setTimeout(() => input.current?.focus(), 300)
    return () => clearTimeout(timer)
  }, [])

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
      const another = current === null || differs
      if (another && (await refuseWhileKeyChangeUnfinished())) {
        analytics.capture('recovery_key_used', {
          outcome: 'key_change_unfinished',
        })
        return
      }

      const opened = another
        ? ((await accountKey.sameAccountSession(newKey)) ??
          (await openSessionFor(newKey)))
        : undefined
      try {
        const rejoining =
          opened !== undefined &&
          opened.accountId === serverAccount.lastAccountId()
        const loss = await accountKey.lossIfReplaced(newKey, {
          accountId: opened?.accountId,
        })

        if (
          differs &&
          !rejoining &&
          (losesSomething(loss) || Platform.OS === 'ios') &&
          !(await confirmAccountReplace(loss, 'recoveryKey'))
        ) {
          analytics.capture('recovery_key_used', { outcome: 'declined' })
          return
        }
        const result = await replaceAccountKey(newKey, {
          source: 'recovery_key',
          confirmedLoss: true,
          session: opened,
          accountId: opened?.accountId,
        })
        analytics.capture('recovery_key_used', { outcome: result.outcome })

        void passkeyKeyArrived(newKey)
        onFinished({
          outcome: result.outcome,
          sameAccount: result.outcome === 'replaced' && result.sameAccount,
        })
      } finally {
        await opened?.close()
      }
    } catch (error) {
      if (error instanceof AccountKeyRetiredError) {
        analytics.capture('recovery_key_used', { outcome: 'retired' })
        Alert.alert(
          i18n.t('account_keyRetiredTitle'),
          error.changedAt
            ? i18n.t('account_keyRetiredBody', {
                date: formatDate(error.changedAt),
              })
            : i18n.t('account_keyRetiredBodyNoDate')
        )
        return
      }
      logger.warn('Using a recovery key failed', error)
      analytics.capture('recovery_key_used', { outcome: 'failed' })
      Alert.alert(
        i18n.t('account_replaceFailedTitle'),

        error instanceof BuddyRemovalPendingError
          ? buddiesErrorMessage(error)
          : error instanceof AccountSessionError &&
              error.failure === 'attestation'
            ? i18n.t(attestationProblemBody(error.attestation ?? 'failed'))
            : error instanceof KeyChangeUnfinishedError
              ? i18n.t('account_keyChangeUnfinished')
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
