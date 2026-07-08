import {
  ChevronRight as ChevronRightIcon,
  Clock as ClockIcon,
  Download as DownloadIcon,
  FileInput as FileInputIcon,
  Sprout as SproutIcon,
  Undo2 as Undo2Icon,
} from 'lucide-react-native'
import { Alert } from 'react-native'
import Wrapper from '@/components/ui/layout/Wrapper'
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view'
import Section from '@/components/ui/inputs/Section'
import InputRowButton from '@/features/settings/components/inputs/InputRowButton'
import IconButton from '@/components/ui/IconButton'
import i18n from '@/lib/locales'
import { StackActions, useNavigation } from '@react-navigation/native'
import { RootStackNavigation, RootStackParamList } from '@/types/rootStack'
import { fetchUpdate } from '@/features/updates/lib/updates'
import { usePreferences } from '@/stores/preferences'
import {
  importContactFromFile,
  processCompleteImport,
  ImportHandlerCallbacks,
} from '@/features/contacts/lib/contactImport'
import useContacts from '@/stores/contactsStore'
import useConversations from '@/stores/conversationStore'
import { useToastController } from '@tamagui/toast'
import { logger } from '@/lib/logger'
import AppPreferencesSection from '@/features/settings/components/preferences-sections/AppPreferencesSection'

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
            leftIcon={Undo2Icon}
            label={i18n.t('recoverContacts')}
            onPress={() => pushScreen('Recover Contacts')}
          >
            <IconButton icon={ChevronRightIcon} />
          </InputRowButton>
          <InputRowButton
            leftIcon={ClockIcon}
            label={i18n.t('dismissedContacts')}
            onPress={() => pushScreen('Dismissed Contacts')}
          >
            <IconButton icon={ChevronRightIcon} />
          </InputRowButton>
          <InputRowButton
            leftIcon={FileInputIcon}
            label={i18n.t('importContact')}
            onPress={handleImportContact}
          >
            <IconButton icon={ChevronRightIcon} />
          </InputRowButton>
          <InputRowButton
            leftIcon={DownloadIcon}
            label={i18n.t('checkForUpdate')}
            onPress={() => fetchUpdate(pushScreen)}
          >
            <IconButton icon={ChevronRightIcon} />
          </InputRowButton>
          <InputRowButton
            leftIcon={SproutIcon}
            label={i18n.t('restartOnboarding')}
            onPress={() =>
              set({ onboardingComplete: false, onboardingStepId: null })
            }
            lastInSection
          >
            <IconButton icon={ChevronRightIcon} />
          </InputRowButton>
        </Section>
      </KeyboardAwareScrollView>
    </Wrapper>
  )
}

export default MoreScreen
