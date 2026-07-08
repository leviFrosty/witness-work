import {
  ChevronRight as ChevronRightIcon,
  Cloud as CloudIcon,
  Ellipsis as EllipsisIcon,
  FileInput as FileInputIcon,
  FileOutput as FileOutputIcon,
  FileText as FileTextIcon,
} from 'lucide-react-native'
import { View, Platform } from 'react-native'
import i18n from '@/lib/locales'
import Section from '@/components/ui/inputs/Section'
import InputRowButton from '@/features/settings/components/inputs/InputRowButton'
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
          leftIcon={FileOutputIcon}
          label={i18n.t('backupAndRestore')}
          onPress={() => handleNavigate('Import and Export')}
        >
          <IconButton icon={ChevronRightIcon} />
        </InputRowButton>
        <InputRowButton
          leftIcon={FileInputIcon}
          label={i18n.t('mytimeImport')}
          onPress={() => handleNavigate('MytimeImport')}
        >
          <IconButton icon={ChevronRightIcon} />
        </InputRowButton>
        <InputRowButton
          leftIcon={FileTextIcon}
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
            <IconButton icon={ChevronRightIcon} />
          </View>
        </InputRowButton>
        {Platform.OS === 'ios' && (
          <InputRowButton
            leftIcon={CloudIcon}
            label={i18n.t('iCloudSync')}
            onPress={() => handleNavigate('PreferencesiCloud')}
          >
            <IconButton icon={ChevronRightIcon} />
          </InputRowButton>
        )}
        <InputRowButton
          leftIcon={EllipsisIcon}
          label={i18n.t('more')}
          onPress={() => navigation.navigate('More')}
          lastInSection
        >
          <IconButton icon={ChevronRightIcon} />
        </InputRowButton>
      </Section>
    </View>
  )
}

export default AppSection
