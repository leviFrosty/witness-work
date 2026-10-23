import {
  Cloud as CloudIcon,
  Ellipsis as EllipsisIcon,
  FileInput as FileInputIcon,
  FileOutput as FileOutputIcon,
  Gauge as GaugeIcon,
  NotebookPen as NotebookPenIcon,
} from 'lucide-react-native'
import i18n from '@/lib/locales'
import { syncSettingsTitleKey } from '@/lib/syncCopy'
import useCloudSyncSupported from '@/hooks/useCloudSyncSupported'
import { registeredCloudSyncTransport } from '@/lib/syncTransport/provider'
import { GroupedListRow, GroupedListSection } from '@/components/ui/GroupedList'
import { SettingsSectionProps } from '@/features/settings/screens/settingScreen'
import {
  useScribeAvailability,
  useScribeEnabled,
  useScribeMemoryEnabled,
  useScribeUsage,
} from '@/features/scribe'
import {
  blockedStatusCopy,
  fullestWindow,
} from '@/features/scribe/components/scribeCopy'

const AppSection = ({
  handleNavigate,
  selectedDestination,
}: SettingsSectionProps) => {
  const cloudSyncSupported = useCloudSyncSupported()
  const scribeEnabled = useScribeEnabled()
  const scribe = useScribeAvailability()
  // Shown in passing: never opens a session (and an account) to fill it in.
  const fullest = fullestWindow(useScribeUsage({ open: false }).usage)
  const memoryEnabled = useScribeMemoryEnabled()
  return (
    <GroupedListSection title={i18n.t('app')}>
      <GroupedListRow
        icon={FileOutputIcon}
        label={i18n.t('backupAndRestore')}
        onPress={() => handleNavigate('Import and Export')}
        selected={selectedDestination === 'Import and Export'}
      />
      <GroupedListRow
        icon={FileInputIcon}
        label={i18n.t('mytimeImport')}
        onPress={() => handleNavigate('MytimeImport')}
        selected={selectedDestination === 'MytimeImport'}
      />
      {scribeEnabled && (
        <GroupedListRow
          icon={GaugeIcon}
          label={i18n.t('scribe_usageTitle')}
          sublabel={
            scribe.status === 'offline'
              ? i18n.t('scribe_offlineBadge')
              : scribe.status === 'blocked'
                ? i18n.t(blockedStatusCopy(scribe.reason))
                : fullest
                  ? i18n.t('scribe_usagePercent', {
                      percent: fullest.percentUsed,
                    })
                  : undefined
          }
          onPress={() => handleNavigate('ScribeUsage')}
          selected={selectedDestination === 'ScribeUsage'}
        />
      )}
      {scribeEnabled && (
        <GroupedListRow
          icon={NotebookPenIcon}
          label={i18n.t('scribe_memoryTitle')}
          sublabel={memoryEnabled ? undefined : i18n.t('scribe_memoryOff')}
          onPress={() => handleNavigate('ScribeMemory')}
          selected={selectedDestination === 'ScribeMemory'}
        />
      )}
      {/* Cloud Sync needs neither iCloud nor Google Play services. */}
      {(cloudSyncSupported || registeredCloudSyncTransport() !== null) && (
        <GroupedListRow
          icon={CloudIcon}
          label={i18n.t(syncSettingsTitleKey())}
          onPress={() => handleNavigate('PreferencesiCloud')}
          selected={selectedDestination === 'PreferencesiCloud'}
        />
      )}
      <GroupedListRow
        icon={EllipsisIcon}
        label={i18n.t('more')}
        testID='settings-more'
        onPress={() => handleNavigate('More')}
        selected={selectedDestination === 'More'}
      />
    </GroupedListSection>
  )
}

export default AppSection
