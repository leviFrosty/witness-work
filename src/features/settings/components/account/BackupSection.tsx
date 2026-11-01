import { useState } from 'react'
import { Alert, View } from 'react-native'
import {
  CloudUpload as CloudUploadIcon,
  History as HistoryIcon,
  ShieldCheck as ShieldCheckIcon,
} from 'lucide-react-native'
import Section from '@/components/ui/inputs/Section'
import InputRowButton from '@/components/ui/inputs/InputRowButton'
import InputRowContainer from '@/components/ui/inputs/InputRowContainer'
import InputRowSwitch from '@/components/ui/inputs/InputRowSwitch'
import Text from '@/components/ui/MyText'
import Spinner from '@/components/ui/Spinner'
import useTheme from '@/contexts/theme'
import useAccessibilityTextSize from '@/hooks/useAccessibilityTextSize'
import { alignText } from '@/lib/direction'
import SectionTitle from '@/features/settings/components/shared/SectionTitle'
import SectionFooter from '@/features/settings/components/account/SectionFooter'
import { backUpNow, disableBackup, enableBackup } from '@/app/account/backup'
import {
  BACKUP_FAILURE_STATUS,
  backupFailureDetail,
  backupTurnOnFailure,
} from '@/app/account/backupCopy'
import type { AccountOverview } from '@/features/settings/hooks/useAccountOverview'
import { formatCalendar } from '@/lib/dates'
import { formatBytes } from '@/lib/formatBytes'
import i18n from '@/lib/locales'
import { useBackupState } from '@/lib/serverAccount/backupStore'

export default function BackupSection({
  accountState,
  onChanged,
}: {
  accountState: AccountOverview['state']

  onChanged: () => void
}) {
  const theme = useTheme()

  const largeText = useAccessibilityTextSize()
  const enabled = useBackupState((state) => state.enabled)
  const uploading = useBackupState((state) => state.uploading)
  const schedule = useBackupState((state) => state.schedule)
  const [turningOn, setTurningOn] = useState(false)

  const turnOn = async () => {
    if (turningOn) return
    setTurningOn(true)
    try {
      const result = await enableBackup('settings')
      if (!result.ok)
        Alert.alert(
          i18n.t('backup_turnOnFailedTitle'),
          i18n.t(backupTurnOnFailure(result.code))
        )
    } finally {
      setTurningOn(false)
      onChanged()
    }
  }

  const turnOff = (deleteServerCopy: boolean) =>
    void disableBackup({ deleteServerCopy }).then(({ deleted }) => {
      onChanged()
      if (deleted === false)
        Alert.alert(
          i18n.t('backup_deleteFailedTitle'),
          i18n.t('backup_turnOffDeleteFailed')
        )
    })

  const confirmTurnOff = () =>
    Alert.alert(i18n.t('backup_turnOffTitle'), i18n.t('backup_turnOffBody'), [
      { text: i18n.t('cancel'), style: 'cancel' },
      { text: i18n.t('backup_turnOffKeep'), onPress: () => turnOff(false) },
      {
        text: i18n.t('backup_turnOffDelete'),
        style: 'destructive',
        onPress: () => turnOff(true),
      },
    ])

  const failed = schedule.lastResult === 'failed' && schedule.lastError
  const status = uploading
    ? i18n.t('backup_statusUploading')
    : failed
      ? i18n.t(BACKUP_FAILURE_STATUS[schedule.lastError!])
      : schedule.lastPutAt
        ? i18n.t('backup_statusLast', {
            when: formatCalendar(schedule.lastPutAt),
            size: formatBytes(schedule.lastSize),
          })
        : i18n.t('backup_statusNotYet')
  const footer =
    enabled && failed && !uploading
      ? backupFailureDetail(schedule.lastError!, accountState)
      : enabled
        ? 'backup_footerOn'
        : 'backup_footerOff'

  return (
    <View style={{ gap: 5 }}>
      <SectionTitle
        text={i18n.t('backup_section')}
        info={i18n.t('backup_sectionInfo')}
        alignWithIcons
      />
      <Section>
        <InputRowSwitch
          leftIcon={ShieldCheckIcon}
          label={i18n.t('backup_switch')}
          value={enabled || turningOn}
          onValueChange={(value) => {
            if (value) void turnOn()
            else confirmTurnOff()
          }}
          lastInSection={!enabled}
        />
        {enabled && (
          <InputRowContainer
            leftIcon={HistoryIcon}
            label={i18n.t('backup_last')}
            controlWidth='auto'
            style={{ justifyContent: 'space-between' }}
          >
            <View
              style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}
            >
              {uploading && <Spinner size='small' />}
              <Text
                testID='backup-status'
                style={{
                  flexShrink: 1,
                  textAlign: largeText ? undefined : alignText('end'),
                  fontSize: theme.fontSize('sm'),
                  color:
                    failed && !uploading
                      ? theme.colors.error
                      : theme.colors.textAlt,
                }}
              >
                {status}
              </Text>
            </View>
          </InputRowContainer>
        )}
        {enabled && (
          <InputRowButton
            leftIcon={CloudUploadIcon}
            label={i18n.t('backup_now')}
            disabled={uploading}
            onPress={() => void backUpNow()}
            lastInSection
          />
        )}
      </Section>
      {footer && <SectionFooter text={i18n.t(footer)} />}
    </View>
  )
}
