import { ScrollView } from 'react-native'
import { useNavigation } from '@react-navigation/native'
import Text from '@/components/ui/MyText'
import Wrapper from '@/components/ui/layout/Wrapper'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import { toast } from '@/stores/toasts'
import SettingsInputLayout from '@/features/settings/components/shared/SettingsInputLayout'
import useDeviceSyncAvailable from '@/features/settings/hooks/useDeviceSyncAvailable'
import ImportOptions, {
  type HostedImportType,
} from '@/features/onboarding/components/ImportOptions'
import { useBackupImport } from '@/app/sync/useBackupImport'
import type { RootStackNavigation } from '@/types/rootStack'

const ImportDataScreen = () => {
  const theme = useTheme()
  const navigation = useNavigation<RootStackNavigation>()
  const deviceSyncAvailable = useDeviceSyncAvailable()
  const { importing, importBackup, unlockSheet } = useBackupImport({
    source: 'settings',
    entryPoint: 'import_data',
  })

  const restoreBackup = async () => {
    if (await importBackup()) toast.success(i18n.t('successfulImport'))
  }
  const select = (importType: HostedImportType) => {
    if (importType === 'mytime') navigation.navigate('MytimeImport')
    else if (importType === 'icloud') navigation.navigate('PreferencesiCloud')
    else void restoreBackup()
  }

  return (
    <SettingsInputLayout>
      <Wrapper insets='bottom'>
        <ScrollView
          contentContainerStyle={{ gap: 20, paddingTop: 30, paddingBottom: 30 }}
        >
          <Text style={{ color: theme.colors.textAlt }}>
            {i18n.t('importData_description')}
          </Text>
          <ImportOptions
            source='settings'
            cloud={
              deviceSyncAvailable
                ? {
                    titleKey: 'syncSettingsTitle',
                    descKey: 'importData_deviceSyncDesc',
                  }
                : null
            }
            backupRestoring={importing}
            onSelect={select}
          />
        </ScrollView>
        {unlockSheet}
      </Wrapper>
    </SettingsInputLayout>
  )
}

export default ImportDataScreen
