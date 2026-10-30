import { useEffect, useRef, useState } from 'react'
import { Platform, TextInput as RNTextInput, View } from 'react-native'
import ActionButton from '@/components/ui/ActionButton'
import Sheet from '@/components/ui/Sheet'
import SimpleProgressBar from '@/components/ui/SimpleProgressBar'
import Text from '@/components/ui/MyText'
import TextInput from '@/components/ui/TextInput'
import useTheme from '@/contexts/theme'
import {
  BackupUnlockError,
  type BackupUnlockProblem,
  type LockedBackupFile,
  type UnlockedBackupFile,
  unlockWithPassword,
} from '@/lib/backupFileLock'
import i18n from '@/lib/locales'
import { logger } from '@/lib/logger'
import { backupPasswordInputProps } from '@/features/settings/components/backup/backupPasswordInput'

export type PasswordUnlockResult = { wrongPasswords: number } & (
  | { outcome: 'unlocked'; unlocked: UnlockedBackupFile }
  | { outcome: 'cancelled' }
  | { outcome: 'failed'; problem: BackupUnlockProblem | 'unexpected' }
)

type Props = {
  /** A password-locked file to open; the sheet shows while there is one. */
  file: LockedBackupFile | null
  /** Once the sheet has closed: what the file held, or why there's nothing. */
  onFinished: (result: PasswordUnlockResult) => void
}

/**
 * Asks for a locked backup's password and opens it. A wrong password says so
 * and asks again; closing the sheet cancels the restore.
 */
export default function UnlockBackupSheet({ file, onFinished }: Props) {
  const theme = useTheme()
  const [busy, setBusy] = useState(false)
  const [closing, setClosing] = useState(false)
  const wrongPasswords = useRef(0)
  const result = useRef<PasswordUnlockResult | null>(null)

  const finish = (outcome: PasswordUnlockResult) => {
    result.current = outcome
    setClosing(true)
  }

  return (
    <Sheet
      open={file !== null && !closing}
      onOpenChange={(open) => {
        if (!open)
          finish({
            outcome: 'cancelled',
            wrongPasswords: wrongPasswords.current,
          })
      }}
      onClosed={() => {
        const outcome = result.current ?? {
          outcome: 'cancelled',
          wrongPasswords: wrongPasswords.current,
        }
        result.current = null
        wrongPasswords.current = 0
        setClosing(false)
        onFinished(outcome)
      }}
      dismissible={!busy}
      backgroundColor={theme.colors.card}
      testID='unlock-backup-sheet'
    >
      {file && (
        <PasswordForm
          file={file}
          busy={busy}
          setBusy={setBusy}
          onWrongPassword={() => wrongPasswords.current++}
          onDone={(outcome) =>
            finish({ ...outcome, wrongPasswords: wrongPasswords.current })
          }
        />
      )}
    </Sheet>
  )
}

function PasswordForm({
  file,
  busy,
  setBusy,
  onWrongPassword,
  onDone,
}: {
  file: LockedBackupFile
  busy: boolean
  setBusy: (busy: boolean) => void
  onWrongPassword: () => void
  onDone: (
    outcome:
      | { outcome: 'unlocked'; unlocked: UnlockedBackupFile }
      | { outcome: 'failed'; problem: BackupUnlockProblem | 'unexpected' }
  ) => void
}) {
  const theme = useTheme()
  const [password, setPassword] = useState('')
  const [wrong, setWrong] = useState(false)
  const [progress, setProgress] = useState(0)
  const input = useRef<RNTextInput>(null)

  // Android can't focus a field in a sheet that's still opening.
  useEffect(() => {
    if (Platform.OS !== 'android') return
    const timer = setTimeout(() => input.current?.focus(), 300)
    return () => clearTimeout(timer)
  }, [])
  // Back to the field for another try, once it's editable again.
  useEffect(() => {
    if (wrong && !busy) input.current?.focus()
  }, [wrong, busy])

  const submit = async () => {
    if (!password || busy) return
    setBusy(true)
    setWrong(false)
    setProgress(0)
    try {
      const unlocked = await unlockWithPassword(file, password, setProgress)
      onDone({ outcome: 'unlocked', unlocked })
    } catch (error) {
      if (error instanceof BackupUnlockError && error.problem === 'key') {
        onWrongPassword()
        setWrong(true)
        setPassword('')
      } else {
        if (!(error instanceof BackupUnlockError))
          logger.warn('[backup] unlocking a backup file failed', error)
        onDone({
          outcome: 'failed',
          problem:
            error instanceof BackupUnlockError ? error.problem : 'unexpected',
        })
      }
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
        {i18n.t('backupUnlock_title')}
      </Text>
      <Text style={{ color: theme.colors.textAlt }}>
        {i18n.t('backupUnlock_description')}
      </Text>
      <TextInput
        {...backupPasswordInputProps}
        ref={input}
        autoFocus
        value={password}
        onChangeText={(text) => {
          setPassword(text)
          if (text) setWrong(false)
        }}
        placeholder={i18n.t('backupLock_passwordLabel')}
        accessibilityLabel={i18n.t('backupLock_passwordLabel')}
        readOnly={busy}
        invalid={wrong}
        returnKeyType='done'
        onSubmitEditing={() => void submit()}
        testID='unlock-backup-password'
      />
      {wrong && (
        <Text
          accessibilityLiveRegion='polite'
          testID='unlock-backup-wrong'
          style={{ fontSize: theme.fontSize('sm'), color: theme.colors.error }}
        >
          {i18n.t('backupUnlock_wrongPassword')}
        </Text>
      )}
      {busy && (
        <SimpleProgressBar percentage={progress} height={4} animated={false} />
      )}
      <ActionButton
        onPress={() => void submit()}
        disabled={!password}
        loading={busy}
        testID='unlock-backup-submit'
      >
        {i18n.t('backupUnlock_submit')}
      </ActionButton>
    </View>
  )
}
