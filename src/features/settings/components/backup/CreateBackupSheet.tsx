import { useRef, useState } from 'react'
import { TextInput as RNTextInput, View } from 'react-native'
import ActionButton from '@/components/ui/ActionButton'
import SegmentedControl from '@/components/ui/SegmentedControl'
import Sheet from '@/components/ui/Sheet'
import SimpleProgressBar from '@/components/ui/SimpleProgressBar'
import Text from '@/components/ui/MyText'
import TextInput from '@/components/ui/TextInput'
import useTheme from '@/contexts/theme'
import {
  accountLockAvailable,
  type BackupFileLockChoice,
} from '@/app/sync/lockedBackupFile'
import {
  type BackupFileLock,
  type LockedBackupFile,
  MIN_BACKUP_PASSWORD_LENGTH,
} from '@/lib/backupFileLock'
import i18n from '@/lib/locales'
import { backupPasswordInputProps } from '@/features/settings/components/backup/backupPasswordInput'

type Props = {
  open: boolean

  lock: (
    choice: BackupFileLockChoice,
    onProgress: (fraction: number) => void
  ) => Promise<LockedBackupFile | null>

  onCancel: (protection: BackupFileLock) => void

  onCreated: (file: LockedBackupFile) => void
  onClose: () => void
}

export default function CreateBackupSheet(props: Props) {
  const theme = useTheme()
  const canLockToAccount = accountLockAvailable()
  const [protection, setProtection] = useState<BackupFileLock>(
    canLockToAccount ? 'account' : 'password'
  )
  const [busy, setBusy] = useState(false)

  const created = useRef<LockedBackupFile | null>(null)
  return (
    <Sheet
      open={props.open}
      onOpenChange={(open) => {
        if (open) return
        props.onCancel(protection)
        props.onClose()
      }}
      onClosed={() => {
        const file = created.current
        created.current = null
        if (file) props.onCreated(file)
      }}
      dismissible={!busy}
      backgroundColor={theme.colors.card}
      testID='create-backup-sheet'
    >
      <Sheet.ScrollView contentContainerStyle={{ padding: 20, gap: 16 }}>
        <Text
          accessibilityRole='header'
          style={{
            fontSize: theme.fontSize('lg'),
            fontFamily: theme.fonts.bold,
          }}
        >
          {i18n.t('createBackup')}
        </Text>
        {canLockToAccount && (
          <SegmentedControl<BackupFileLock>
            options={[
              {
                key: 'account',
                label: i18n.t('backupLock_account'),
                testID: 'backup-lock-account',
              },
              {
                key: 'password',
                label: i18n.t('backupLock_password'),
                testID: 'backup-lock-password',
              },
            ]}
            value={protection}
            onChange={setProtection}
            disabled={busy}
            testID='backup-lock-choice'
          />
        )}
        <Text style={{ color: theme.colors.textAlt }}>
          {i18n.t(
            protection === 'account'
              ? 'backupLock_accountHint'
              : 'backupLock_passwordHint'
          )}
        </Text>
        <LockForm
          protection={protection}
          busy={busy}
          setBusy={setBusy}
          lock={props.lock}
          onLocked={(file) => {
            created.current = file
            props.onClose()
          }}
        />
      </Sheet.ScrollView>
    </Sheet>
  )
}

function LockForm({
  protection,
  busy,
  setBusy,
  lock,
  onLocked,
}: {
  protection: BackupFileLock
  busy: boolean
  setBusy: (busy: boolean) => void
  lock: Props['lock']
  onLocked: (file: LockedBackupFile) => void
}) {
  const theme = useTheme()
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [progress, setProgress] = useState(0)
  const confirmInput = useRef<RNTextInput>(null)

  const longEnough = password.length >= MIN_BACKUP_PASSWORD_LENGTH
  const matches = confirmation === password

  const mismatch =
    confirmation.length >= password.length &&
    confirmation.length > 0 &&
    !matches
  const ready = protection === 'account' || (longEnough && matches)

  const submit = async () => {
    if (!ready || busy) return
    setBusy(true)
    setProgress(0)
    const file = await lock(
      protection === 'password'
        ? { lock: 'password', password }
        : { lock: 'account' },
      setProgress
    )
    setBusy(false)
    if (file) onLocked(file)
  }

  return (
    <View style={{ gap: 12 }}>
      {protection === 'password' && (
        <>
          <TextInput
            {...backupPasswordInputProps}
            value={password}
            onChangeText={setPassword}
            placeholder={i18n.t('backupLock_passwordLabel')}
            accessibilityLabel={i18n.t('backupLock_passwordLabel')}
            readOnly={busy}
            returnKeyType='next'
            submitBehavior='submit'
            onSubmitEditing={() => confirmInput.current?.focus()}
            testID='backup-password'
          />
          <TextInput
            {...backupPasswordInputProps}
            ref={confirmInput}
            value={confirmation}
            onChangeText={setConfirmation}
            placeholder={i18n.t('backupLock_confirmLabel')}
            accessibilityLabel={i18n.t('backupLock_confirmLabel')}
            readOnly={busy}
            invalid={mismatch}
            returnKeyType='done'
            onSubmitEditing={() => void submit()}
            testID='backup-password-confirm'
          />
          <Text
            accessibilityLiveRegion='polite'
            testID='backup-password-status'
            style={{
              fontSize: theme.fontSize('sm'),
              color: mismatch ? theme.colors.error : theme.colors.textAlt,
            }}
          >
            {mismatch
              ? i18n.t('backupLock_passwordMismatch')
              : i18n.t('backupLock_passwordRule', {
                  minimum: MIN_BACKUP_PASSWORD_LENGTH,
                })}
          </Text>
        </>
      )}
      {busy && protection === 'password' && (
        <SimpleProgressBar percentage={progress} height={4} animated={false} />
      )}
      <ActionButton
        onPress={() => void submit()}
        disabled={!ready}
        loading={busy}
        testID='backup-create'
      >
        {i18n.t('createBackup')}
      </ActionButton>
    </View>
  )
}
