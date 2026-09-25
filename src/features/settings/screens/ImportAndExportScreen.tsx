import {
  FileInput as FileInputIcon,
  Upload as UploadIcon,
} from 'lucide-react-native'
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from 'react'
import ActionButton from '@/components/ui/ActionButton'
import Text from '@/components/ui/MyText'
import Wrapper from '@/components/ui/layout/Wrapper'
import i18n from '@/lib/locales'
import useContacts from '@/stores/contactsStore'
import useConversations from '@/stores/conversationStore'
import { usePreferences } from '@/stores/preferences'
import useServiceReport, { migrateServiceReports } from '@/stores/serviceReport'
import * as FileSystem from 'expo-file-system/legacy'
import { errorTracking } from '@/lib/errorTracking'
import * as Sharing from 'expo-sharing'
import * as DocumentPicker from 'expo-document-picker'
import { Alert, View } from 'react-native'
import { Spinner } from 'tamagui'
import useTheme from '@/contexts/theme'
import Card from '@/components/ui/Card'
import Divider from '@/components/ui/Divider'
import Badge from '@/components/ui/Badge'
import XView from '@/components/ui/layout/XView'
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view'
import IconButton from '@/components/ui/IconButton'
import { useTimeCache } from '@/stores/timeCache'
import SettingsInputLayout from '@/features/settings/components/shared/SettingsInputLayout'
import { analytics } from '@/lib/analytics'
import { RouteProp, useRoute } from '@react-navigation/native'
import { RootStackParamList } from '@/types/rootStack'

/**
 * Any new stores should be added to this type to be included in the
 * import/export
 */
type ImportFile = {
  serviceReportStore?: unknown
  contactStore?: unknown
  conversationStore?: unknown
  preferencesStore?: unknown
}

const ImportAndExportScreen = () => {
  const route = useRoute<RouteProp<RootStackParamList, 'Import and Export'>>()
  const entryPoint = route.params?.source ?? 'settings'
  const serviceReportStore = useServiceReport()
  const contactStore = useContacts()
  const conversationStore = useConversations()
  const preferencesStore = usePreferences()
  const timeCache = useTimeCache()

  const [loading, setLoading] = useState(false)
  const [successfulImport, setSuccessfulImport] = useState(false)
  const exportFileUri = FileSystem.cacheDirectory + `witness-work-backup.json`
  const theme = useTheme()

  const validImportFile = (data: unknown): boolean => {
    if (typeof data !== 'object') return false
    if (data === null) return false

    return true
  }

  const handleImport = async () => {
    const startedAt = Date.now()
    let stage = 'file_picker'
    const properties = {
      import_type: 'backup_json',
      source: 'settings',
      entry_point: entryPoint,
    }
    setLoading(true)
    setSuccessfulImport(false)
    analytics.capture('import_started', {
      ...properties,
    })

    try {
      const { assets, canceled } = await DocumentPicker.getDocumentAsync({
        multiple: false,
        copyToCacheDirectory: true,
        type: 'application/json',
      })

      if (canceled) {
        analytics.capture('import_cancelled', {
          ...properties,
          stage,
          elapsed_ms: Date.now() - startedAt,
        })
        setLoading(false)
        return
      }

      const exportFileUri = assets[0].uri
      analytics.capture('import_file_selected', properties)
      stage = 'read_file'

      await FileSystem.readAsStringAsync(exportFileUri)
        .then((contents) => {
          stage = 'validate_file'
          const data = JSON.parse(contents) as ImportFile

          if (!validImportFile(data)) {
            analytics.capture('import_failed', {
              ...properties,
              stage,
              elapsed_ms: Date.now() - startedAt,
              error_code: 'invalid_file',
            })
            Alert.alert(
              i18n.t('importErrorInvalidFile_title'),
              i18n.t('importErrorInvalidFile_description')
            )
            return
          }

          stage = 'migrate'
          // If importFile has old serviceReport data structure, update to new before importing.
          if (
            data.serviceReportStore &&
            Array.isArray((data.serviceReportStore as any).serviceReports)
          ) {
            const years: any = migrateServiceReports(
              (data.serviceReportStore as any).serviceReports
            )
            ;(data.serviceReportStore as any).serviceReports = years
          }

          stage = 'restore'
          analytics.capture('import_commit_started', properties)
          data.serviceReportStore &&
            serviceReportStore.set(data.serviceReportStore)
          data.contactStore && contactStore.set(data.contactStore)
          data.conversationStore &&
            conversationStore.set(data.conversationStore)
          data.preferencesStore && preferencesStore.set(data.preferencesStore)
          timeCache.invalidateAllCache()
          setSuccessfulImport(true)
          analytics.capture('backup_imported', {
            ...properties,
            elapsed_ms: Date.now() - startedAt,
          })
        })
        .finally(() => {
          setLoading(false)
        })
    } catch (error) {
      analytics.capture('import_failed', {
        ...properties,
        stage,
        elapsed_ms: Date.now() - startedAt,
        error_code:
          stage === 'validate_file' && error instanceof SyntaxError
            ? 'invalid_json'
            : 'unexpected',
      })
      errorTracking.captureException(error)
      setLoading(false)
      Alert.alert(
        i18n.t('importError_title'),
        i18n.t('importError_description')
      )
    }
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
    const data: ImportFile = {
      serviceReportStore,
      contactStore,
      conversationStore,
      preferencesStore,
    }
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
          analytics.capture('backup_file_created', properties)
          stage = 'share_sheet'
          analytics.capture('backup_share_sheet_requested', properties)
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
            <ActionButton disabled={loading} onPress={handleExport}>
              {loading ? (
                <Spinner />
              ) : (
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
              )}
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
            <ActionButton disabled={loading} onPress={handleImport}>
              {loading ? (
                <Spinner />
              ) : (
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
              )}
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
