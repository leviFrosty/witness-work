import {
  EllipsisVertical as EllipsisVerticalIcon,
  Share as ShareIcon,
  Star as StarIcon,
} from 'lucide-react-native'
import { MenuAction, MenuView } from '@react-native-menu/menu'
import { useToastController } from '@tamagui/toast'
import IconButton from '@/components/ui/IconButton'
import useTheme from '@/contexts/theme'
import confirmDestructive from '@/lib/confirmDestructive'
import { isContactDismissed } from '@/lib/dismissedContacts'
import i18n from '@/lib/locales'
import useContacts from '@/stores/contactsStore'
import { deleteHouseholderContact } from '@/stores/householderData'
import { usePreferences } from '@/stores/preferences'
import useConversations from '@/stores/conversationStore'
import { RootStackNavigation } from '@/types/rootStack'
import useContactShare from '@/features/contacts/hooks/useContactShare'
import { sortVisitsNewestFirst } from '@/features/contacts/lib/visitTimeline'

type Props = {
  contactId: string
  color: string
  embedded: boolean
  navigation: Pick<RootStackNavigation, 'navigate' | 'replace' | 'popToTop'>
  onDismiss: () => void
}

/** Overflow menu (edit / dismiss / archive), favorite star, and share. */
const ContactHeaderActions = ({
  contactId,
  color,
  embedded,
  navigation,
  onDismiss,
}: Props) => {
  const theme = useTheme()
  const toast = useToastController()
  const { contacts, toggleFavoriteContact, customFieldDefs } = useContacts()
  // Data protection mode hard-deletes instead of archiving and removes the
  // share link, which would expose the record beyond this device.
  const dataProtectionMode = usePreferences((s) => s.dataProtectionMode)
  const { conversations } = useConversations()
  const contact = contacts.find((c) => c.id === contactId)
  const share = useContactShare(
    contact,
    sortVisitsNewestFirst(
      conversations.filter((visit) => visit.contact.id === contactId)
    ),
    customFieldDefs
  )
  if (!contact) return null

  const actions: MenuAction[] = [
    {
      id: 'edit',
      title: i18n.t('edit'),
      image: 'pencil',
      imageColor: '#000000',
    },
    ...(isContactDismissed(contact)
      ? []
      : [
          {
            id: 'dismiss',
            title: i18n.t('dismiss'),
            image: 'clock',
            imageColor: '#000000',
          },
        ]),
    {
      id: 'delete',
      title: i18n.t(dataProtectionMode ? 'delete' : 'archive'),
      image: dataProtectionMode ? 'trash' : 'archivebox',
      imageColor: theme.colors.error,
      attributes: { destructive: true },
    },
  ]

  const onAction = (action: string) => {
    switch (action) {
      case 'edit':
        if (embedded)
          navigation.navigate('Contact Form', {
            id: contact.id,
            edit: true,
            returnToContacts: true,
          })
        else navigation.replace('Contact Form', { id: contact.id, edit: true })
        break
      case 'dismiss':
        onDismiss()
        break
      case 'delete':
        confirmDestructive({
          title: i18n.t(
            dataProtectionMode ? 'permanentlyDelete' : 'archiveContact_question'
          ),
          description: i18n.t(
            dataProtectionMode
              ? 'permanentlyDeleteContact_warning'
              : 'archiveContact_description'
          ),
          confirmLabel: i18n.t(dataProtectionMode ? 'delete' : 'archive'),
          onConfirm: () => {
            deleteHouseholderContact(contact.id)
            toast.show(i18n.t('success'), {
              message: i18n.t(dataProtectionMode ? 'deleted' : 'archived'),
              native: true,
            })
            if (!embedded) navigation.popToTop()
          },
        })
        break
    }
  }

  return (
    <>
      <MenuView
        actions={actions}
        onPressAction={({ nativeEvent }) => onAction(nativeEvent.event)}
      >
        <IconButton
          icon={EllipsisVerticalIcon}
          color={color}
          accessibilityLabel={i18n.t('edit')}
        />
      </MenuView>
      <IconButton
        icon={StarIcon}
        color={color}
        fill={contact.isFavorite ? color : 'none'}
        accessibilityLabel={i18n.t('contacts_field_isFavorite')}
        onPress={() => toggleFavoriteContact(contact.id)}
      />
      {!dataProtectionMode && (
        <IconButton
          icon={ShareIcon}
          color={color}
          accessibilityLabel={i18n.t('share')}
          onPress={share}
        />
      )}
    </>
  )
}

export default ContactHeaderActions
