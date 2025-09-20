import { Sheet } from 'tamagui'
import { Alert, View } from 'react-native'
import Button from './Button'
import IconButton from './IconButton'
import Text from './MyText'
import i18n from '../lib/locales'
import useTheme from '../contexts/theme'
import {
  faClock,
  faPencil,
  faTimes,
  faTrash,
} from '@fortawesome/free-solid-svg-icons'
import { Contact } from '../types/contact'
import { useCallback } from 'react'
import { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { RootStackParamList } from '../types/rootStack'
import { useToastController } from '@tamagui/toast'
import useContacts from '../stores/contactsStore'
import { isContactDismissed } from '../lib/dismissedContacts'

export type ContactActionsSheetState = {
  open: boolean
  contact: Contact | undefined
}

interface ContactActionsSheetProps {
  sheet: ContactActionsSheetState
  setSheet: React.Dispatch<React.SetStateAction<ContactActionsSheetState>>
  navigation: NativeStackNavigationProp<
    RootStackParamList,
    'Contact Details',
    undefined
  >
  setDismissSheetOpen: React.Dispatch<React.SetStateAction<boolean>>
}

const ContactActionsSheet = ({
  sheet,
  setSheet,
  navigation,
  setDismissSheetOpen,
}: ContactActionsSheetProps) => {
  const theme = useTheme()
  const toast = useToastController()
  const { deleteContact } = useContacts()
  const { contact } = sheet

  const handleAction = useCallback(
    async (action: 'edit' | 'dismiss' | 'delete') => {
      if (!contact) return
      setSheet({ open: false, contact: undefined })

      switch (action) {
        case 'edit': {
          navigation.replace('Contact Form', {
            id: contact.id,
            edit: true,
          })
          break
        }

        case 'dismiss': {
          setDismissSheetOpen(true)
          break
        }

        case 'delete': {
          Alert.alert(
            i18n.t('archiveContact_question'),
            i18n.t('archiveContact_description'),
            [
              {
                text: i18n.t('cancel'),
                style: 'cancel',
              },
              {
                text: i18n.t('delete'),
                style: 'destructive',
                onPress: () => {
                  deleteContact(contact.id)
                  toast.show(i18n.t('success'), {
                    message: i18n.t('archived'),
                    native: true,
                  })
                  navigation.popToTop()
                },
              },
            ]
          )
          break
        }
      }
    },
    [contact, deleteContact, navigation, setDismissSheetOpen, setSheet, toast]
  )

  if (!contact) {
    return null
  }

  const isDismissed = isContactDismissed(contact)

  return (
    <Sheet
      open={sheet.open}
      onOpenChange={(o: boolean) => setSheet({ ...sheet, open: o })}
      dismissOnSnapToBottom
      modal
    >
      <Sheet.Handle />
      <Sheet.Overlay zIndex={100_000 - 1} />
      <Sheet.Frame>
        <View style={{ padding: 30, gap: 15 }}>
          <View style={{ marginBottom: 20 }}>
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <Text
                style={{
                  fontSize: theme.fontSize('xl'),
                  fontFamily: theme.fonts.semiBold,
                  color: theme.colors.text,
                }}
              >
                {i18n.t('actions')}
              </Text>

              <IconButton
                icon={faTimes}
                size='xl'
                onPress={() => setSheet({ open: false, contact: undefined })}
              />
            </View>
          </View>

          <View style={{ gap: 10 }}>
            <Button
              onPress={() => handleAction('edit')}
              variant='solid'
              style={{ backgroundColor: theme.colors.card }}
            >
              <View
                style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}
              >
                <IconButton icon={faPencil} />
                <Text style={{ color: theme.colors.text }}>
                  {i18n.t('edit')}
                </Text>
              </View>
            </Button>

            {!isDismissed && (
              <Button
                onPress={() => handleAction('dismiss')}
                variant='solid'
                style={{ backgroundColor: theme.colors.card }}
              >
                <View
                  style={{
                    flexDirection: 'row',
                    gap: 10,
                    alignItems: 'center',
                  }}
                >
                  <IconButton icon={faClock} />
                  <Text style={{ color: theme.colors.text }}>
                    {i18n.t('dismiss')}
                  </Text>
                </View>
              </Button>
            )}

            <Button
              onPress={() => handleAction('delete')}
              variant='solid'
              style={{ backgroundColor: theme.colors.errorTranslucent }}
            >
              <View
                style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}
              >
                <IconButton icon={faTrash} color={theme.colors.error} />
                <Text style={{ color: theme.colors.error }}>
                  {i18n.t('delete')}
                </Text>
              </View>
            </Button>
          </View>
        </View>
      </Sheet.Frame>
    </Sheet>
  )
}

export default ContactActionsSheet
