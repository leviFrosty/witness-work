import {
  Archive as ArchiveIcon,
  Clock as ClockIcon,
  Star as StarIcon,
  StarOff as StarOffIcon,
  Trash2 as TrashIcon,
} from 'lucide-react-native'
import { useToastController } from '@tamagui/toast'

import PullDownMenu from '@/components/ui/PullDownMenu'
import {
  dismissOptionLabel,
  useDismissContacts,
  useDismissDurations,
} from '@/hooks/useDismissContact'
import confirmDestructive from '@/lib/confirmDestructive'
import i18n from '@/lib/locales'
import useContacts from '@/stores/contactsStore'
import { deleteHouseholderContacts } from '@/stores/householderData'
import { usePreferences } from '@/stores/preferences'
import type { Contact } from '@/types/contact'
import {
  SelectionBar,
  SelectionBarButton,
  SelectionBarItem,
} from '@/features/contacts/components/ListSelection'
import type { ListSelection } from '@/features/contacts/hooks/useListSelection'

/**
 * Batch actions for the Contacts list in Select mode: favorite, dismiss for a
 * duration, and archive (delete in data protection mode). Each ends Select mode
 * once it runs.
 */
export default function ContactsSelectionBar({
  contacts,
  selection,
  bottom,
}: {
  /** The selected contacts. */
  contacts: Contact[]
  selection: ListSelection
  bottom: number
}) {
  const toast = useToastController()
  const setContactsFavorite = useContacts((s) => s.setContactsFavorite)
  const dataProtectionMode = usePreferences((s) => s.dataProtectionMode)
  const dismissContacts = useDismissContacts()
  const durations = useDismissDurations()
  const count = contacts.length
  const none = count === 0
  const allFavorite = !none && contacts.every((c) => c.isFavorite)

  const favorite = () => {
    setContactsFavorite(
      contacts.map((c) => c.id),
      !allFavorite
    )
    selection.track(allFavorite ? 'unfavorite' : 'favorite')
    selection.finish()
  }

  const archive = () =>
    confirmDestructive({
      title: dataProtectionMode
        ? // @ts-expect-error TranslationKey doesn't handle keys that contain objects.
          i18n.t('deleteContacts_question', { count })
        : // @ts-expect-error TranslationKey doesn't handle keys that contain objects.
          i18n.t('archiveContacts_question', { count }),
      description: i18n.t(
        dataProtectionMode
          ? 'permanentlyDeleteContacts_warning'
          : 'archiveContacts_description'
      ),
      confirmLabel: i18n.t(dataProtectionMode ? 'delete' : 'archive'),
      onConfirm: () => {
        deleteHouseholderContacts(contacts.map((c) => c.id))
        toast.show(i18n.t('success'), {
          message: i18n.t(dataProtectionMode ? 'deleted' : 'archived'),
          native: true,
        })
        selection.track(dataProtectionMode ? 'delete' : 'archive', count)
        selection.finish()
      },
    })

  const dismissItem = (
    <SelectionBarItem
      icon={ClockIcon}
      label={i18n.t('dismissFor')}
      disabled={none}
    />
  )

  return (
    <SelectionBar bottom={bottom}>
      <SelectionBarButton
        icon={allFavorite ? StarOffIcon : StarIcon}
        label={i18n.t(allFavorite ? 'removeFromFavorites' : 'addToFavorites')}
        disabled={none}
        onPress={favorite}
      />
      {none ? (
        dismissItem
      ) : (
        <PullDownMenu
          analyticsSurface='contacts_selection'
          accessibilityLabel={i18n.t('dismissFor')}
          actions={durations.map((option) => ({
            id: option.key,
            title: dismissOptionLabel(option),
            onPress: () => {
              selection.track('dismiss', count)
              selection.finish()
              void dismissContacts(contacts, option)
            },
          }))}
        >
          {dismissItem}
        </PullDownMenu>
      )}
      <SelectionBarButton
        icon={dataProtectionMode ? TrashIcon : ArchiveIcon}
        label={i18n.t(dataProtectionMode ? 'delete' : 'archive')}
        destructive
        disabled={none}
        onPress={archive}
      />
    </SelectionBar>
  )
}
