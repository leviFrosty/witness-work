import {
  Clock as ClockIcon,
  Download as DownloadIcon,
  FileInput as FileInputIcon,
  Sprout as SproutIcon,
} from 'lucide-react-native'
import { UndoIcon } from '@/components/ui/DirectionalIcon'
import { Alert } from 'react-native'
import { useState } from 'react'
import {
  GroupedList,
  GroupedListRow,
  GroupedListSection,
} from '@/components/ui/GroupedList'
import Spinner from '@/components/ui/Spinner'
import i18n from '@/lib/locales'
import { StackActions, useNavigation } from '@react-navigation/native'
import { RootStackNavigation, RootStackParamList } from '@/types/rootStack'
import { fetchUpdate } from '@/features/updates/lib/updates'
import { hasCapability } from '@/lib/platformCapabilities'
import { usePreferences } from '@/stores/preferences'
import {
  importContactFromFile,
  processCompleteImport,
  ImportHandlerCallbacks,
} from '@/features/contacts/lib/contactImport'
import useContacts from '@/stores/contactsStore'
import useConversations from '@/stores/conversationStore'
import { toast } from '@/stores/toasts'
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

  const pushScreen = (screen: keyof RootStackParamList) => {
    navigation.dispatch(StackActions.push(screen))
  }

  const [checkingUpdate, setCheckingUpdate] = useState(false)
  const checkForUpdate = async () => {
    if (checkingUpdate) return
    setCheckingUpdate(true)
    try {
      await fetchUpdate(pushScreen)
    } finally {
      setCheckingUpdate(false)
    }
  }

  const callbacks: ImportHandlerCallbacks = {
    addContact,
    updateContact,
    addConversation,
    updateConversation,
    recoverContact,
    mergeIncomingCustomFieldDefs,
    getConversations: () => useConversations.getState().conversations,
    showToast: (title: string, message: string) => {
      toast.success(title, { message })
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
    <GroupedList>
      <AppPreferencesSection />
      <GroupedListSection>
        <GroupedListRow
          icon={UndoIcon}
          label={i18n.t('recoverContacts')}
          onPress={() => pushScreen('Recover Contacts')}
        />
        <GroupedListRow
          icon={ClockIcon}
          label={i18n.t('dismissedContacts')}
          onPress={() => pushScreen('Dismissed Contacts')}
        />
        <GroupedListRow
          icon={FileInputIcon}
          label={i18n.t('importContact')}
          onPress={handleImportContact}
        />
        {hasCapability('otaUpdates') && (
          <GroupedListRow
            icon={DownloadIcon}
            label={i18n.t('checkForUpdate')}
            onPress={checkForUpdate}
            accessory={checkingUpdate ? 'none' : 'chevron'}
            trailing={
              checkingUpdate ? (
                <Spinner size='small' label={i18n.t('update_checking')} />
              ) : undefined
            }
          />
        )}
        <GroupedListRow
          icon={SproutIcon}
          label={i18n.t('restartOnboarding')}
          onPress={() =>
            set({
              onboardingComplete: false,
              onboardingStepId: null,
              onboardingPasskeysOffered: null,
            })
          }
        />
      </GroupedListSection>
    </GroupedList>
  )
}

export default MoreScreen
