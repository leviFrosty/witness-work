import {
  Ellipsis as EllipsisIcon,
  FileInput as FileInputIcon,
  FileOutput as FileOutputIcon,
} from 'lucide-react-native'
import i18n from '@/lib/locales'
import { GroupedListRow, GroupedListSection } from '@/components/ui/GroupedList'
import { SettingsSectionProps } from '@/features/settings/screens/settingScreen'

const AppSection = ({
  handleNavigate,
  selectedDestination,
}: SettingsSectionProps) => {
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
        label={i18n.t('importData')}
        onPress={() => handleNavigate('Import Data')}
        selected={selectedDestination === 'Import Data'}
      />
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
