import {
  Archive as ArchiveIcon,
  Clock as ClockIcon,
  Star as StarIcon,
  StarOff as StarOffIcon,
  Trash2 as TrashIcon,
} from 'lucide-react-native'

import PullDownMenu from '@/components/ui/PullDownMenu'
import {
  dismissOptionLabel,
  useDismissContacts,
  useDismissDurations,
} from '@/hooks/useDismissContact'
import useRemoveContacts from '@/hooks/useRemoveContacts'
import i18n from '@/lib/locales'
import useContacts from '@/stores/contactsStore'
import type { Contact } from '@/types/contact'
import {
  SelectionBar,
  SelectionBarButton,
  SelectionBarItem,
} from '@/features/contacts/components/ListSelection'
import type { ListSelection } from '@/features/contacts/hooks/useListSelection'

export default function ContactsSelectionBar({
  contacts,
  selection,
  bottom,
}: {
  contacts: Contact[]
  selection: ListSelection
  bottom: number
}) {
  const setContactsFavorite = useContacts((s) => s.setContactsFavorite)
  const dismissContacts = useDismissContacts()
  const durations = useDismissDurations()
  const { canArchive, archive, remove } = useRemoveContacts()
  const count = contacts.length
  const none = count === 0
  const allFavorite = !none && contacts.every((c) => c.isFavorite)

  const favorite = () => {
    setContactsFavorite(
      contacts.map((c) => c.id),
      !allFavorite
    )
    selection.finish()
  }

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
          accessibilityLabel={i18n.t('dismissFor')}
          actions={durations.map((option) => ({
            id: option.key,
            title: dismissOptionLabel(option),
            onPress: () => {
              selection.finish()
              void dismissContacts(contacts, option)
            },
          }))}
        >
          {dismissItem}
        </PullDownMenu>
      )}
      {canArchive && (
        <SelectionBarButton
          icon={ArchiveIcon}
          label={i18n.t('archive')}
          disabled={none}
          onPress={() => archive(contacts, selection.finish)}
        />
      )}
      <SelectionBarButton
        icon={TrashIcon}
        label={i18n.t('delete')}
        destructive
        disabled={none}
        onPress={() => remove(contacts, selection.finish)}
      />
    </SelectionBar>
  )
}
