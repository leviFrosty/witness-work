import { View, Alert } from 'react-native'
import i18n from '../../../lib/locales'
import Section from '../../../components/inputs/Section'
import InputRowButton from '../../../components/inputs/InputRowButton'
import {
  faChevronRight,
  faClock,
  faDownload,
  faFileExport,
  faFileImport,
  faSeedling,
  faUndo,
} from '@fortawesome/free-solid-svg-icons'
import IconButton from '../../../components/IconButton'
import { fetchUpdate } from '../../../lib/updates'
import SectionTitle from '../shared/SectionTitle'
import { SettingsSectionProps } from '../settingScreen'
import { usePreferences } from '../../../stores/preferences'
import {
  importContactFromFile,
  processCompleteImport,
  ImportHandlerCallbacks,
} from '../../../lib/contactImport'
import useContacts from '../../../stores/contactsStore'
import useConversations from '../../../stores/conversationStore'
import { useToastController } from '@tamagui/toast'
import { useNavigation } from '@react-navigation/native'
import { RootStackNavigation } from '../../../types/rootStack'

const AppSection = ({ handleNavigate }: SettingsSectionProps) => {
  const { set } = usePreferences()
  const {
    contacts,
    deletedContacts,
    addContact,
    updateContact,
    recoverContact,
  } = useContacts()
  const { addConversation, updateConversation } = useConversations()
  const toast = useToastController()
  const navigation = useNavigation<RootStackNavigation>()

  const callbacks: ImportHandlerCallbacks = {
    addContact,
    updateContact,
    addConversation,
    updateConversation,
    recoverContact,
    showToast: (title: string, message: string) => {
      toast.show(title, { message, native: true })
    },
    navigate: (contactId: string) => {
      navigation.navigate('Contact Details', { id: contactId })
    },
  }

  const handleImportContact = async () => {
    try {
      const result = await importContactFromFile()

      if (!result.success || !result.data) {
        if (result.error !== 'Cancelled') {
          Alert.alert(
            i18n.t('invalidFile'),
            result.error || i18n.t('invalidFile_description')
          )
        }
        return
      }

      await processCompleteImport(
        result.data,
        contacts,
        deletedContacts,
        callbacks
      )
    } catch (error) {
      console.error('Error importing contact:', error)
      Alert.alert(i18n.t('error'), i18n.t('importError_description'))
    }
  }

  return (
    <View style={{ gap: 3 }}>
      <SectionTitle text={i18n.t('app')} />
      <Section>
        <InputRowButton
          leftIcon={faUndo}
          label={i18n.t('recoverContacts')}
          onPress={() => handleNavigate('Recover Contacts')}
        >
          <IconButton icon={faChevronRight} />
        </InputRowButton>
        <InputRowButton
          leftIcon={faClock}
          label={i18n.t('dismissedContacts')}
          onPress={() => handleNavigate('Dismissed Contacts')}
        >
          <IconButton icon={faChevronRight} />
        </InputRowButton>
        <InputRowButton
          leftIcon={faFileImport}
          label={i18n.t('importContact')}
          onPress={handleImportContact}
        >
          <IconButton icon={faChevronRight} />
        </InputRowButton>
        <InputRowButton
          leftIcon={faFileExport}
          label={i18n.t('backupAndRestore')}
          onPress={() => handleNavigate('Import and Export')}
        >
          <IconButton icon={faChevronRight} />
        </InputRowButton>
        <InputRowButton
          leftIcon={faDownload}
          label={i18n.t('checkForUpdate')}
          onPress={() => fetchUpdate(handleNavigate)}
        >
          <IconButton icon={faChevronRight} />
        </InputRowButton>
        <InputRowButton
          leftIcon={faSeedling}
          label={i18n.t('restartOnboarding')}
          onPress={() => set({ onboardingComplete: false })}
          lastInSection
        >
          <IconButton icon={faChevronRight} />
        </InputRowButton>
      </Section>
    </View>
  )
}

export default AppSection
