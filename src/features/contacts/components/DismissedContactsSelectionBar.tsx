import {
  Archive as ArchiveIcon,
  Trash2 as TrashIcon,
  Undo2 as Undo2Icon,
} from 'lucide-react-native'

import { useUndismissContacts } from '@/hooks/useDismissContact'
import useRemoveContacts from '@/hooks/useRemoveContacts'
import i18n from '@/lib/locales'
import type { Contact } from '@/types/contact'
import {
  SelectionBar,
  SelectionBarButton,
} from '@/features/contacts/components/ListSelection'
import type { ListSelection } from '@/features/contacts/hooks/useListSelection'

/**
 * Batch actions for Dismissed Contacts in Select mode: undismiss, archive (not
 * in data protection mode), and a red Delete, with the same confirmations as
 * the Contacts list. Each ends Select mode once it runs.
 */
export default function DismissedContactsSelectionBar({
  contacts,
  selection,
  bottom,
}: {
  /** The selected contacts. */
  contacts: Contact[]
  selection: ListSelection
  bottom: number
}) {
  const undismiss = useUndismissContacts()
  const { canArchive, archive, remove } = useRemoveContacts()
  const count = contacts.length
  const none = count === 0

  const undismissSelected = () => {
    selection.finish()
    void undismiss(contacts)
  }

  return (
    <SelectionBar bottom={bottom}>
      <SelectionBarButton
        icon={Undo2Icon}
        label={i18n.t('undismiss')}
        disabled={none}
        onPress={undismissSelected}
      />
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
