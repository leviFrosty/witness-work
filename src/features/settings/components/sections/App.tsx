import { View, Platform } from 'react-native'
import i18n from '@/lib/locales'
import Section from '@/components/ui/inputs/Section'
import InputRowButton from '@/features/settings/components/inputs/InputRowButton'
import {
  faChevronRight,
  faCloud,
  faEllipsisH,
  faFileExport,
  faFileImport,
  faFileLines,
} from '@fortawesome/free-solid-svg-icons'
import IconButton from '@/components/ui/IconButton'
import SectionTitle from '@/features/settings/components/shared/SectionTitle'
import { SettingsSectionProps } from '@/features/settings/screens/settingScreen'
import { useNavigation } from '@react-navigation/native'
import { RootStackNavigation } from '@/types/rootStack'
import { useNotesImportAvailability } from '@/features/notes-import/hooks/useNotesImportAvailability'
import { useNotesImportManager } from '@/features/notes-import/hooks/useNotesImportManager'
import { unviewedReadyImportCount } from '@/features/notes-import/lib/notesImportLedger'
import NotesImportReadyDot from '@/features/notes-import/components/NotesImportReadyDot'

const AppSection = ({ handleNavigate }: SettingsSectionProps) => {
  const navigation = useNavigation<RootStackNavigation>()
  const notesImport = useNotesImportAvailability()
  const notesImportReadyCount = useNotesImportManager((s) =>
    unviewedReadyImportCount(s.entries)
  )
  return (
    <View style={{ gap: 3 }}>
      <SectionTitle text={i18n.t('app')} />
      <Section>
        <InputRowButton
          leftIcon={faFileExport}
          label={i18n.t('backupAndRestore')}
          onPress={() => handleNavigate('Import and Export')}
        >
          <IconButton icon={faChevronRight} />
        </InputRowButton>
        <InputRowButton
          leftIcon={faFileImport}
          label={i18n.t('mytimeImport')}
          onPress={() => handleNavigate('MytimeImport')}
        >
          <IconButton icon={faChevronRight} />
        </InputRowButton>
        <InputRowButton
          leftIcon={faFileLines}
          label={i18n.t('notesImport_settingsLabel')}
          disabled={!notesImport.available}
          sublabel={
            notesImport.available
              ? undefined
              : i18n.t('notesImport_unavailable')
          }
          onPress={() => handleNavigate('NotesImportComposer')}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <NotesImportReadyDot visible={notesImportReadyCount > 0} />
            <IconButton icon={faChevronRight} />
          </View>
        </InputRowButton>
        {Platform.OS === 'ios' && (
          <InputRowButton
            leftIcon={faCloud}
            label={i18n.t('iCloudSync')}
            onPress={() => handleNavigate('PreferencesiCloud')}
          >
            <IconButton icon={faChevronRight} />
          </InputRowButton>
        )}
        <InputRowButton
          leftIcon={faEllipsisH}
          label={i18n.t('more')}
          onPress={() => navigation.navigate('More')}
          lastInSection
        >
          <IconButton icon={faChevronRight} />
        </InputRowButton>
      </Section>
    </View>
  )
}

export default AppSection
