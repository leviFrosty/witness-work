import { Alert } from 'react-native'
import Wrapper from '../../../components/layout/Wrapper'
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view'
import Section from '../../../components/inputs/Section'
import InputRowButton from '../../../components/inputs/InputRowButton'
import {
  faChevronRight,
  faClock,
  faDownload,
  faFileImport,
  faSeedling,
  faUndo,
} from '@fortawesome/free-solid-svg-icons'
import IconButton from '../../../components/IconButton'
import i18n from '../../../lib/locales'
import { StackActions, useNavigation } from '@react-navigation/native'
import {
  RootStackNavigation,
  RootStackParamList,
} from '../../../types/rootStack'
import { fetchUpdate } from '../../updates/lib/updates'
import { usePreferences } from '../../../stores/preferences'
import {
  importContactFromFile,
  processCompleteImport,
  ImportHandlerCallbacks,
} from '../../contacts/lib/contactImport'
import useContacts from '../../../stores/contactsStore'
import useConversations from '../../../stores/conversationStore'
import { useToastController } from '@tamagui/toast'
import { logger } from '../../../lib/logger'
import AppPreferencesSection from '../components/preferences-sections/AppPreferencesSection'

const MoreScreen = () => {
  const navigation = useNavigation<RootStackNavigation>()
  const { set } = usePreferences()
  const {
    contacts,
    deletedContacts,
    addContact,
    updateContact,
    recoverContact,
    mergeIncomingCustomFieldDefs,
  } = useContacts()
  const { addConversation, updateConversation } = useConversations()
  const toast = useToastController()

  const pushScreen = (screen: keyof RootStackParamList) => {
    navigation.dispatch(StackActions.push(screen))
  }

  const callbacks: ImportHandlerCallbacks = {
    addContact,
    updateContact,
    addConversation,
    updateConversation,
    recoverContact,
    mergeIncomingCustomFieldDefs,
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
      logger.error('Error importing contact:', error)
      Alert.alert(i18n.t('error'), i18n.t('importError_description'))
    }
  }

  return (
    <Wrapper insets='bottom'>
      <KeyboardAwareScrollView
        contentContainerStyle={{ gap: 30, paddingTop: 30, paddingBottom: 30 }}
      >
        <AppPreferencesSection />
        <Section>
          <InputRowButton
            leftIcon={faUndo}
            label={i18n.t('recoverContacts')}
            onPress={() => pushScreen('Recover Contacts')}
          >
            <IconButton icon={faChevronRight} />
          </InputRowButton>
          <InputRowButton
            leftIcon={faClock}
            label={i18n.t('dismissedContacts')}
            onPress={() => pushScreen('Dismissed Contacts')}
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
            leftIcon={faDownload}
            label={i18n.t('checkForUpdate')}
            onPress={() => fetchUpdate(pushScreen)}
          >
            <IconButton icon={faChevronRight} />
          </InputRowButton>
          <InputRowButton
            leftIcon={faSeedling}
            label={i18n.t('restartOnboarding')}
            onPress={() =>
              set({ onboardingComplete: false, onboardingStepId: null })
            }
            lastInSection
          >
            <IconButton icon={faChevronRight} />
          </InputRowButton>
        </Section>
      </KeyboardAwareScrollView>
    </Wrapper>
  )
}

export default MoreScreen
