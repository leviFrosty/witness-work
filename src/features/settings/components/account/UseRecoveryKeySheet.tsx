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
import { offerRestore } from '@/app/account/backupRestore'
import { analytics } from '@/lib/analytics'
import {
  AccountKeyRetiredError,
  losesSomething,
  type ReplaceAccountKeyResult,
} from '@/lib/accountKey/accountKey'
import { formatDate } from '@/lib/dates'
import { serverAccount } from '@/lib/serverAccount'
import { AccountSessionError } from '@/lib/serverAccount/session'
import {
  normalizeRecoveryKey,
  parseRecoveryKey,
  RECOVERY_KEY_LENGTH,
} from '@/lib/accountKey/recoveryKey'
import i18n from '@/lib/locales'
import { logger } from '@/lib/logger'
import { BuddyRemovalPendingError } from '@/features/buddies/lib/engine'
import { RECOVERY_KEY_FONT } from '@/features/settings/components/account/recoveryKeyFont'
import { confirmAccountReplace } from '@/features/settings/components/account/confirmAccountReplace'
import { refuseWhileKeyChangeUnfinished } from '@/features/settings/components/account/keyChange/refuseWhileKeyChangeUnfinished'
import useAttestationSupport from '@/features/settings/hooks/useAttestationSupport'

type Props = {
  open: boolean
  onClose: () => void
  /** The key was used: this device's account changed (or already matched). */
  onDone: () => void
  /** The account's backup was restored afterwards. */
  onRestored?: () => void
}

/** What using the key did, told once the sheet has closed. */
type Finished = {
  outcome: ReplaceAccountKeyResult['outcome']
  /** Signed back in to the account this device was on. */
  sameAccount: boolean
}

/**
 * Enter a recovery key to make its account this device's. Checks the key as
 * it's typed; when the key differs from this device's and Buddies has data
 * here, a destructive confirmation names what's lost first. The key's session
 * opens before anything changes, so a key a key change retired is refused.
 * Closing the sheet cancels. A device that can never attest can't use the
 * account, so it's told that instead of replacing anything.
 */
export default function UseRecoveryKeySheet(props: Props) {
  const theme = useTheme()
  const [busy, setBusy] = useState(false)
  // Told once the sheet has closed, so the alert doesn't land mid-dismiss.
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
        // Back on the account it was on: its records here are that
        // account's, and Cloud Sync and backup carry on with them, so
        // there's nothing to restore.
        else if (done.sameAccount)
          Alert.alert(
            i18n.t('account_rejoinedTitle'),
            i18n.t('account_rejoinedBody')
          )
        else
          // Then the account's backup, when it has one.
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

/** This device can never attest: the account wouldn't work here. */
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

/**
 * A session for another account's key, to adopt as the key is replaced; none
 * while the server has accounts off, when the key is used as before accounts.
 */
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
      const another = current === null || differs
      if (another && (await refuseWhileKeyChangeUnfinished())) {
        analytics.capture('recovery_key_used', {
          outcome: 'key_change_unfinished',
        })
        return
      }
      // Opened before anything changes or is asked: a retired key, or one
      // the server can't be asked about, leaves this device as it was. The
      // account this device was on is tried first, so its key never makes an
      // account.
      const opened = another
        ? ((await accountKey.sameAccountSession(newKey)) ??
          (await openSessionFor(newKey)))
        : undefined
      try {
        // The account this device was on, under its changed key: a rejoin,
        // with nothing to lose, leave or confirm.
        const rejoining =
          opened !== undefined &&
          opened.accountId === serverAccount.lastAccountId()
        const loss = await accountKey.lossIfReplaced(newKey, {
          accountId: opened?.accountId,
        })
        // On iOS the key reaches every Apple device on the same iCloud
        // Keychain, so replacing one there always asks.
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
        onFinished({
          outcome: result.outcome,
          sameAccount: result.outcome === 'replaced' && result.sameAccount,
        })
      } finally {
        // Adopted by then, or declined; closing an adopted one does nothing.
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
          ? i18n.t('buddies_deleteAllPending')
          : error instanceof AccountSessionError &&
              error.failure === 'attestation'
            ? i18n.t(attestationProblemBody(error.attestation ?? 'failed'))
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
