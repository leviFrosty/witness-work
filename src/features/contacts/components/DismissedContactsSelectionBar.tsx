import {
  Archive as ArchiveIcon,
  Trash2 as TrashIcon,
  Undo2 as Undo2Icon,
} from 'lucide-react-native'
import { useToastController } from '@tamagui/toast'

import { useUndismissContacts } from '@/hooks/useDismissContact'
import confirmDestructive from '@/lib/confirmDestructive'
import i18n from '@/lib/locales'
import { deleteHouseholderContacts } from '@/stores/householderData'
import { usePreferences } from '@/stores/preferences'
import type { Contact } from '@/types/contact'
import {
  SelectionBar,
  SelectionBarButton,
} from '@/features/contacts/components/ListSelection'
import type { ListSelection } from '@/features/contacts/hooks/useListSelection'

/**
 * Batch actions for Dismissed Contacts in Select mode: undismiss, and archive
 * (delete in data protection mode) with the same confirmation and toast as the
 * Contacts list. Each ends Select mode once it runs.
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
  const toast = useToastController()
  const dataProtectionMode = usePreferences((s) => s.dataProtectionMode)
  const undismiss = useUndismissContacts()
  const count = contacts.length
  const none = count === 0

  const undismissSelected = () => {
    selection.finish()
    void undismiss(contacts)
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
        selection.finish()
      },
    })

  return (
    <SelectionBar bottom={bottom}>
      <SelectionBarButton
        icon={Undo2Icon}
        label={i18n.t('undismiss')}
        disabled={none}
        onPress={undismissSelected}
      />
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
