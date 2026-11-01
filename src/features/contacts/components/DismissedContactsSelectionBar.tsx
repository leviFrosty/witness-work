import {
  Archive as ArchiveIcon,
  Trash2 as TrashIcon,
} from 'lucide-react-native'
import { UndoIcon } from '@/components/ui/DirectionalIcon'

import { useUndismissContacts } from '@/hooks/useDismissContact'
import useRemoveContacts from '@/hooks/useRemoveContacts'
import i18n from '@/lib/locales'
import type { Contact } from '@/types/contact'
import {
  SelectionBar,
  SelectionBarButton,
} from '@/features/contacts/components/ListSelection'
import type { ListSelection } from '@/features/contacts/hooks/useListSelection'

export default function DismissedContactsSelectionBar({
  contacts,
  selection,
  bottom,
}: {
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
        icon={UndoIcon}
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
