/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from 'react'
import ActionButton from '../components/ActionButton'
import Text from '../components/MyText'
import Wrapper from '../components/layout/Wrapper'
import i18n from '../lib/locales'
import useContacts from '../stores/contactsStore'
import useConversations from '../stores/conversationStore'
import { usePreferences } from '../stores/preferences'
import useServiceReport, {
  migrateServiceReports,
} from '../stores/serviceReport'
import * as FileSystem from 'expo-file-system'
import * as Sentry from '@sentry/react-native'
import * as Sharing from 'expo-sharing'
import * as DocumentPicker from 'expo-document-picker'
import { Alert, View } from 'react-native'
import { Spinner } from 'tamagui'
import useTheme from '../contexts/theme'
import Card from '../components/Card'
import Divider from '../components/Divider'
import Badge from '../components/Badge'
import XView from '../components/layout/XView'
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view'
import IconButton from '../components/IconButton'
import { faFileImport, faUpload } from '@fortawesome/free-solid-svg-icons'

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
  const serviceReportStore = useServiceReport()
  const contactStore = useContacts()
  const conversationStore = useConversations()
  const preferencesStore = usePreferences()

  const [loading, setLoading] = useState(false)
  const [successfulImport, setSuccessfulImport] = useState(false)
  const exportFileUri = FileSystem.cacheDirectory + `jw-time-backup.json`
  const theme = useTheme()

  const validImportFile = (data: unknown): boolean => {
    if (typeof data !== 'object') return false
    if (data === null) return false

    return true
  }

  const handleImport = async () => {
    setLoading(true)
    setSuccessfulImport(false)

    try {
      const { assets, canceled } = await DocumentPicker.getDocumentAsync({
        multiple: false,
        copyToCacheDirectory: true,
        type: 'application/json',
      })

      if (canceled) {
        setLoading(false)
        return
      }

      const exportFileUri = assets[0].uri

      FileSystem.readAsStringAsync(exportFileUri)
        .then((contents) => {
          const data = JSON.parse(contents) as ImportFile

          if (!validImportFile(data)) {
            Alert.alert(
              i18n.t('importErrorInvalidFile_title'),
              i18n.t('importErrorInvalidFile_description')
            )
            return
          }

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

          data.serviceReportStore &&
            serviceReportStore.set(data.serviceReportStore)
          data.contactStore && contactStore.set(data.contactStore)
          data.conversationStore &&
            conversationStore.set(data.conversationStore)
          data.preferencesStore && preferencesStore.set(data.preferencesStore)
          setSuccessfulImport(true)
        })
        .finally(() => {
          setLoading(false)
        })
    } catch (error) {
      Sentry.captureException(error)
      setLoading(false)
      Alert.alert(
        i18n.t('importError_title'),
        i18n.t('importError_description')
      )
    }
  }

  const handleExport = async () => {
    const data: ImportFile = {
      serviceReportStore,
      contactStore,
      conversationStore,
      preferencesStore,
    }
    setLoading(true)

    if (!Sharing.isAvailableAsync()) {
      Alert.alert('sharingIsNotAvailable')
      return
    }

    preferencesStore.set({ lastBackupDate: new Date() })

    try {
      FileSystem.writeAsStringAsync(exportFileUri, JSON.stringify(data))
        .then(async () => {
          await Sharing.shareAsync(exportFileUri)
        })
        .finally(() => {
          setLoading(false)
        })
    } catch (error) {
      Sentry.captureException(error)
      setLoading(false)
      Alert.alert(
        i18n.t('errorExporting'),
        i18n.t('errorExporting_description')
      )
    }
  }

  return (
    <Wrapper insets='bottom' style={{ paddingHorizontal: 15, paddingTop: 30 }}>
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
                <IconButton icon={faUpload} color={theme.colors.textInverse} />
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
                  icon={faFileImport}
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
  )
}

export default ImportAndExportScreen
