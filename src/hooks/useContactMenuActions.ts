import { useNavigation } from '@react-navigation/native'
import { useToastController } from '@tamagui/toast'
import { parsePhoneNumber } from 'awesome-phonenumber'
import { getLocales } from 'expo-localization'

import type {
  ContextMenuAction,
  ContextMenuEntries,
  ContextMenuSubmenu,
} from '@/components/ui/ContextMenu'
import useDismissContact, {
  dismissOptionLabel,
  useDismissDurations,
} from '@/hooks/useDismissContact'
import { addressToString, navigateTo } from '@/lib/address'
import confirmDestructive from '@/lib/confirmDestructive'
import { isContactDismissed } from '@/lib/dismissedContacts'
import i18n from '@/lib/locales'
import { handleCall, handleMessage } from '@/lib/phone'
import useContacts from '@/stores/contactsStore'
import { deleteHouseholderContact } from '@/stores/householderData'
import { usePreferences } from '@/stores/preferences'
import type { Contact } from '@/types/contact'
import type { RootStackNavigation } from '@/types/rootStack'

export type ContactMenuOptions = {
  /** Adds "Open Contact" for surfaces whose tap does something else. */
  showOpen?: boolean
  /** Contact sharing lives in the contacts feature; pass it to offer Share. */
  onShare?: () => void
  /** Overrides the default edit navigation (e.g. the embedded detail pane). */
  onEdit?: () => void
  /** Overrides the default visit-form navigation. */
  onAddVisit?: (notAtHome: boolean) => void
  /** Runs after the contact is dismissed or archived (e.g. leave its screen). */
  onRemoved?: () => void
  /** Adds "Select", starting the list's Select mode with this contact checked. */
  onSelect?: () => void
}

/**
 * The removal half of a Contact's menu: Dismiss For ▸ durations, and Archive
 * (Delete in data protection mode, which keeps nothing to recover). Shared by
 * the contact menu and Contact Details' More menu. Dismissing an already
 * dismissed Contact changes its duration.
 */
export function useContactRemovalActions(
  contact: Contact | undefined,
  {
    onDismissed,
    onArchived,
  }: {
    /** Runs after the contact is dismissed. */
    onDismissed?: () => void
    /** Runs after the archive/delete is confirmed. */
    onArchived?: () => void
  } = {}
): { dismiss: ContextMenuSubmenu | null; archive: ContextMenuAction | null } {
  const toast = useToastController()
  const dismiss = useDismissContact()
  const durations = useDismissDurations()
  const dataProtectionMode = usePreferences((s) => s.dataProtectionMode)

  if (!contact) return { dismiss: null, archive: null }

  const archive = () =>
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
        onArchived?.()
      },
    })

  return {
    dismiss: {
      id: 'dismiss',
      title: i18n.t('dismissFor'),
      systemImage: 'clock',
      actions: durations.map((option) => ({
        id: option.key,
        title: dismissOptionLabel(option),
        onPress: () => {
          void dismiss(contact, option).then(() => onDismissed?.())
        },
      })),
    },
    archive: {
      id: dataProtectionMode ? 'delete' : 'archive',
      title: i18n.t(dataProtectionMode ? 'delete' : 'archive'),
      systemImage: dataProtectionMode ? 'trash' : 'archivebox',
      destructive: true,
      onPress: archive,
    },
  }
}

/**
 * The one menu for a Contact, wherever it appears (list rows, map cards, study
 * rows, follow-ups), so long-pressing a person always offers the same actions.
 * Every item also lives on Contact Details.
 */
export default function useContactMenuActions(
  contact: Contact | undefined,
  options: ContactMenuOptions = {}
): ContextMenuEntries {
  const navigation = useNavigation<RootStackNavigation>()
  const toggleFavoriteContact = useContacts((s) => s.toggleFavoriteContact)
  const dataProtectionMode = usePreferences((s) => s.dataProtectionMode)
  const defaultNavigationMapProvider = usePreferences(
    (s) => s.defaultNavigationMapProvider
  )

  const { showOpen, onShare, onEdit, onAddVisit, onRemoved, onSelect } = options
  const removal = useContactRemovalActions(contact, {
    onDismissed: onRemoved,
    onArchived: onRemoved,
  })

  if (!contact) return []

  const phone = contact.phone
    ? parsePhoneNumber(contact.phone, {
        regionCode:
          contact.phoneRegionCode || getLocales()[0]?.regionCode || '',
      })
    : null
  const hasLocation = !!addressToString(contact.address) || !!contact.coordinate

  const addVisit = (notAtHome: boolean) =>
    onAddVisit
      ? onAddVisit(notAtHome)
      : navigation.navigate('Visit Form', { contactId: contact.id, notAtHome })

  return [
    [
      {
        id: 'add_conversation',
        title: i18n.t('addConversation'),
        systemImage: 'bubble.left.and.bubble.right',
        onPress: () => addVisit(false),
      },
      // Data protection mode drops not-at-home records entirely.
      !dataProtectionMode && {
        id: 'not_at_home',
        title: i18n.t('notAtHome'),
        systemImage: 'door.left.hand.closed',
        onPress: () => addVisit(true),
      },
      phone && {
        id: 'call',
        title: i18n.t('call'),
        systemImage: 'phone',
        onPress: () => handleCall(contact, phone, navigation),
      },
      phone && {
        id: 'message',
        title: i18n.t('message'),
        systemImage: 'message',
        onPress: () => handleMessage(contact, phone, navigation),
      },
      hasLocation && {
        id: 'navigate',
        title: i18n.t('navigate'),
        systemImage: 'arrow.triangle.turn.up.right.diamond',
        onPress: () => navigateTo(contact, defaultNavigationMapProvider),
      },
    ],
    [
      showOpen && {
        id: 'open',
        title: i18n.t('openContact'),
        systemImage: 'person.crop.circle',
        onPress: () =>
          navigation.navigate('Contact Details', { id: contact.id }),
      },
      {
        id: contact.isFavorite ? 'unfavorite' : 'favorite',
        title: i18n.t(
          contact.isFavorite ? 'removeFromFavorites' : 'addToFavorites'
        ),
        systemImage: contact.isFavorite ? 'star.slash' : 'star',
        onPress: () => toggleFavoriteContact(contact.id),
      },
      onShare && {
        id: 'share',
        title: i18n.t('shareEllipsis'),
        systemImage: 'square.and.arrow.up',
        onPress: onShare,
      },
      {
        id: 'edit',
        title: i18n.t('edit'),
        systemImage: 'pencil',
        onPress: () =>
          onEdit
            ? onEdit()
            : navigation.navigate('Contact Form', {
                id: contact.id,
                edit: true,
              }),
      },
      onSelect && {
        id: 'select',
        title: i18n.t('select'),
        systemImage: 'checkmark.circle',
        onPress: onSelect,
      },
    ],
    [!isContactDismissed(contact) && removal.dismiss, removal.archive],
  ]
}
