import {
  FileInput as FileInputIcon,
  Upload as UploadIcon,
} from 'lucide-react-native'
import { useState } from 'react'
import ActionButton from '@/components/ui/ActionButton'
import Text from '@/components/ui/MyText'
import Wrapper from '@/components/ui/layout/Wrapper'
import i18n from '@/lib/locales'
import { Platform } from 'react-native'
import useTheme from '@/contexts/theme'
import Card from '@/components/ui/Card'
import Divider from '@/components/ui/Divider'
import Badge from '@/components/ui/Badge'
import XView from '@/components/ui/layout/XView'
import InfoPopover from '@/components/ui/InfoPopover'
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view'
import IconButton from '@/components/ui/IconButton'
import SettingsInputLayout from '@/features/settings/components/shared/SettingsInputLayout'
import { RouteProp, useRoute } from '@react-navigation/native'
import { RootStackParamList } from '@/types/rootStack'
import { useBackupImport } from '@/app/sync/useBackupImport'
import DeviceSyncLinkSection from '@/features/settings/components/sync/DeviceSyncLinkSection'
import CreateBackupSheet from '@/features/settings/components/backup/CreateBackupSheet'
import useBackupExport from '@/features/settings/hooks/useBackupExport'

const ImportAndExportScreen = () => {
  const route = useRoute<RouteProp<RootStackParamList, 'Import and Export'>>()
  const entryPoint = route.params?.source ?? 'settings'
  const { importing, importBackup, unlockSheet } = useBackupImport({
    source: 'settings',
    entryPoint,
  })

  const exporter = useBackupExport(entryPoint)
  const [protecting, setProtecting] = useState(false)
  const [successfulImport, setSuccessfulImport] = useState(false)
  const theme = useTheme()

  const handleImport = async () => {
    setSuccessfulImport(false)
    if (await importBackup()) setSuccessfulImport(true)
  }

  const handleExport = () => {
    exporter.start()
    setProtecting(true)
  }

  return (
    <SettingsInputLayout>
      <Wrapper insets='bottom' style={{ paddingTop: 30 }}>
        <KeyboardAwareScrollView contentContainerStyle={{ gap: 30 }}>
          <XView style={{ gap: 0 }}>
            <Text
              accessibilityRole='header'
              style={{
                flexShrink: 1,
                fontSize: theme.fontSize('xl'),
                fontFamily: theme.fonts.semiBold,
              }}
            >
              {i18n.t('backup')}
            </Text>
            <InfoPopover
              title={i18n.t('backup')}
              description={i18n.t('backupRecommendations')}
              inline
            />
          </XView>
          <Card>
            <ActionButton
              disabled={importing || protecting}
              loading={exporter.sharing}
              onPress={handleExport}
              testID='backup-create-open'
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
            <Text style={{ color: theme.colors.textAlt }}>
              {i18n.t(
                Platform.OS === 'android'
                  ? 'restoreFromBackup_hintAndroid'
                  : 'restoreFromBackup_hint'
              )}
            </Text>
            <ActionButton
              disabled={exporter.sharing || protecting}
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
          <DeviceSyncLinkSection />
          <Divider />
          <Text style={{ color: theme.colors.textAlt }}>
            {i18n.t('backupReasoning')}
          </Text>
        </KeyboardAwareScrollView>
        <CreateBackupSheet
          open={protecting}
          lock={exporter.lock}
          onCancel={exporter.cancel}
          onCreated={(file) => void exporter.share(file)}
          onClose={() => setProtecting(false)}
        />
        {unlockSheet}
      </Wrapper>
    </SettingsInputLayout>
  )
}

export default ImportAndExportScreen
