import { ActionSheetIOS, Alert, Platform } from 'react-native'
import i18n from '../lib/locales'
import { Contact } from '../types/contact'
import { useCallback, useEffect, useRef } from 'react'
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

type ActionKey = 'edit' | 'dismiss' | 'delete'

const ContactActionsSheet = ({
  sheet,
  setSheet,
  navigation,
  setDismissSheetOpen,
}: ContactActionsSheetProps) => {
  const toast = useToastController()
  const { deleteContact } = useContacts()
  const { contact } = sheet

  const handleAction = useCallback(
    (action: ActionKey) => {
      if (!contact) return
      setSheet({ open: false, contact: undefined })

      switch (action) {
        case 'edit':
          navigation.replace('Contact Form', {
            id: contact.id,
            edit: true,
          })
          break
        case 'dismiss':
          setDismissSheetOpen(true)
          break
        case 'delete':
          Alert.alert(
            i18n.t('archiveContact_question'),
            i18n.t('archiveContact_description'),
            [
              { text: i18n.t('cancel'), style: 'cancel' },
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
    },
    [contact, deleteContact, navigation, setDismissSheetOpen, setSheet, toast]
  )

  // Stable refs so the effect only depends on sheet.open / contact and
  // doesn't re-fire the ActionSheet on every render.
  const handleActionRef = useRef(handleAction)
  handleActionRef.current = handleAction
  const setSheetRef = useRef(setSheet)
  setSheetRef.current = setSheet

  // iOS: present a true UIKit action sheet via ActionSheetIOS. Fires once
  // per `sheet.open` transition. No portal, no overlay artifacts.
  useEffect(() => {
    if (Platform.OS !== 'ios' || !sheet.open || !contact) return

    const isDismissed = isContactDismissed(contact)
    const actions: { key: ActionKey | 'cancel'; label: string }[] = [
      { key: 'edit', label: i18n.t('edit') },
      ...(isDismissed
        ? []
        : [{ key: 'dismiss' as const, label: i18n.t('dismiss') }]),
      { key: 'delete', label: i18n.t('delete') },
      { key: 'cancel', label: i18n.t('cancel') },
    ]

    ActionSheetIOS.showActionSheetWithOptions(
      {
        title: i18n.t('actions'),
        options: actions.map((a) => a.label),
        destructiveButtonIndex: actions.findIndex((a) => a.key === 'delete'),
        cancelButtonIndex: actions.findIndex((a) => a.key === 'cancel'),
      },
      (index) => {
        const picked = actions[index]
        if (!picked || picked.key === 'cancel') {
          setSheetRef.current({ open: false, contact: undefined })
          return
        }
        handleActionRef.current(picked.key)
      }
    )
  }, [sheet.open, contact])

  return null
}

export default ContactActionsSheet
