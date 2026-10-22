import { useNotesImportEnabled } from '@/hooks/useNotesImportEnabled'
import {
  Cloud as CloudIcon,
  Ellipsis as EllipsisIcon,
  FileInput as FileInputIcon,
  FileOutput as FileOutputIcon,
  FileText as FileTextIcon,
} from 'lucide-react-native'
import i18n from '@/lib/locales'
import { syncSettingsTitleKey } from '@/lib/syncCopy'
import useCloudSyncSupported from '@/hooks/useCloudSyncSupported'
import { registeredCloudSyncTransport } from '@/lib/syncTransport/provider'
import { GroupedListRow, GroupedListSection } from '@/components/ui/GroupedList'
import { SettingsSectionProps } from '@/features/settings/screens/settingScreen'
import { useNotesImportAvailability } from '@/features/notes-import/hooks/useNotesImportAvailability'
import { useNotesImportManager } from '@/features/notes-import/hooks/useNotesImportManager'
import { unviewedReadyImportCount } from '@/features/notes-import/lib/notesImportLedger'
import NotesImportReadyDot from '@/features/notes-import/components/NotesImportReadyDot'

const AppSection = ({
  handleNavigate,
  selectedDestination,
}: SettingsSectionProps) => {
  const notesImportEnabled = useNotesImportEnabled()
  const cloudSyncSupported = useCloudSyncSupported()
  const notesImport = useNotesImportAvailability()
  const notesImportReadyCount = useNotesImportManager((s) =>
    unviewedReadyImportCount(s.entries)
  )
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
      {notesImportEnabled && (
        <GroupedListRow
          icon={FileTextIcon}
          label={i18n.t('notesImport_settingsLabel')}
          // Only a real answer closes it. While checking, offline or after a
          // failed check, the composer explains and offers Try Again. A
          // suspended account can still review imports it already ran.
          disabled={
            notesImport.status === 'unavailable' &&
            notesImport.reason !== 'suspended'
          }
          sublabel={
            notesImport.status !== 'unavailable'
              ? undefined
              : notesImport.updateRequired
                ? i18n.t('notesImport_updateRequired')
                : notesImport.reason === 'device_unverified'
                  ? i18n.t('account_statusUnverified')
                  : notesImport.reason === 'suspended'
                    ? i18n.t('account_statusSuspended')
                    : i18n.t('notesImport_unavailable')
          }
          onPress={() => handleNavigate('NotesImportComposer')}
          selected={selectedDestination === 'NotesImportComposer'}
          trailing={
            notesImportReadyCount > 0 ? (
              <NotesImportReadyDot visible />
            ) : undefined
          }
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
