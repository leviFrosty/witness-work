import {
  FileInput as FileInputIcon,
  Upload as UploadIcon,
} from 'lucide-react-native'
import { useState } from 'react'
import ActionButton from '@/components/ui/ActionButton'
import Text from '@/components/ui/MyText'
import Wrapper from '@/components/ui/layout/Wrapper'
import i18n from '@/lib/locales'
import { usePreferences } from '@/stores/preferences'
import * as FileSystem from 'expo-file-system/legacy'
import { errorTracking } from '@/lib/errorTracking'
import * as Sharing from 'expo-sharing'
import { Alert, View } from 'react-native'
import useTheme from '@/contexts/theme'
import Card from '@/components/ui/Card'
import Divider from '@/components/ui/Divider'
import Badge from '@/components/ui/Badge'
import XView from '@/components/ui/layout/XView'
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view'
import IconButton from '@/components/ui/IconButton'
import SettingsInputLayout from '@/features/settings/components/shared/SettingsInputLayout'
import { analytics } from '@/lib/analytics'
import { RouteProp, useRoute } from '@react-navigation/native'
import { RootStackParamList } from '@/types/rootStack'
import { createBackupFile } from '@/lib/backupFile'
import { useBackupImport } from '@/hooks/useBackupImport'

const ImportAndExportScreen = () => {
  const route = useRoute<RouteProp<RootStackParamList, 'Import and Export'>>()
  const entryPoint = route.params?.source ?? 'settings'
  const preferencesStore = usePreferences()
  const { importing, importBackup } = useBackupImport({
    source: 'settings',
    entryPoint,
  })

  const [loading, setLoading] = useState(false)
  const [successfulImport, setSuccessfulImport] = useState(false)
  const exportFileUri = FileSystem.cacheDirectory + `witness-work-backup.json`
  const theme = useTheme()

  const handleImport = async () => {
    setSuccessfulImport(false)
    if (await importBackup()) setSuccessfulImport(true)
  }

  const handleExport = async () => {
    const startedAt = Date.now()
    let stage = 'sharing_availability'
    const properties = {
      source: 'settings',
      entry_point: entryPoint,
      destination: 'share_sheet',
    }
    analytics.capture('backup_export_started', properties)
    const data = createBackupFile()
    setLoading(true)

    try {
      if (!(await Sharing.isAvailableAsync())) {
        setLoading(false)
        analytics.capture('backup_export_failed', {
          ...properties,
          stage,
          elapsed_ms: Date.now() - startedAt,
          error_code: 'sharing_unavailable',
        })
        Alert.alert(i18n.t('sharingIsNotAvailable'))
        return
      }

      preferencesStore.set({ lastBackupDate: new Date() })

      stage = 'write_file'
      await FileSystem.writeAsStringAsync(exportFileUri, JSON.stringify(data))
        .then(async () => {
          stage = 'share_sheet'

          await Sharing.shareAsync(exportFileUri)
          // Expo resolves on both sharing and cancellation; this is not proof
          // that the user saved a backup outside the app.
          analytics.capture('backup_exported', {
            ...properties,
            outcome: 'unknown',
            elapsed_ms: Date.now() - startedAt,
          })
        })
        .finally(() => {
          setLoading(false)
        })
    } catch (error) {
      analytics.capture('backup_export_failed', {
        ...properties,
        stage,
        elapsed_ms: Date.now() - startedAt,
        error_code: 'unexpected',
      })
      errorTracking.captureException(error)
      setLoading(false)
      Alert.alert(
        i18n.t('errorExporting'),
        i18n.t('errorExporting_description')
      )
    }
  }

  return (
    <SettingsInputLayout>
      <Wrapper insets='bottom' style={{ paddingTop: 30 }}>
        <KeyboardAwareScrollView contentContainerStyle={{ gap: 30 }}>
          <Text
            style={{
              fontSize: theme.fontSize('xl'),
              fontFamily: theme.fonts.semiBold,
            }}
          >
            {i18n.t('backup')}
          </Text>
          <View style={{ gap: 10 }}>
            <Text>{i18n.t('backupRecommendations')}</Text>
          </View>
          <Card>
            <ActionButton
              disabled={importing}
              loading={loading}
              onPress={handleExport}
            >
              <XView>
                <IconButton
                  icon={UploadIcon}
                  color={theme.colors.textInverse}
                />
                <Text
                  style={{
                    color: theme.colors.textInverse,
                    fontFamily: theme.fonts.bold,
                  }}
                >
                  {i18n.t('createBackup')}
                </Text>
              </XView>
            </ActionButton>
          </Card>

          <Divider />
          <Card>
            {successfulImport && (
              <XView>
                <Badge color={theme.colors.accentTranslucent}>
                  <Text>{i18n.t('successfulImport')}</Text>
                </Badge>
              </XView>
            )}
            <ActionButton
              disabled={loading}
              loading={importing}
              onPress={handleImport}
            >
              <XView>
                <IconButton
                  icon={FileInputIcon}
                  color={theme.colors.textInverse}
                />
                <Text
                  style={{
                    color: theme.colors.textInverse,
                    fontFamily: theme.fonts.bold,
                  }}
                >
                  {i18n.t('restoreFromBackup')}
                </Text>
              </XView>
            </ActionButton>
          </Card>
          <Divider />
          <Text style={{ color: theme.colors.textAlt }}>
            {i18n.t('backupReasoning')}
          </Text>
        </KeyboardAwareScrollView>
      </Wrapper>
    </SettingsInputLayout>
  )
}

export default ImportAndExportScreen
