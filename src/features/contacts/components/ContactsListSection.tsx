import { View } from 'react-native'
import SuggestedSectionHeader from '@/components/SuggestedSectionHeader'
import i18n, { type TranslationKey } from '@/lib/locales'
import { suggestedSectionTitleKey } from '@/lib/suggestedContacts'
import type {
  ContactsListItem,
  ContactsListSectionKey,
} from '@/features/contacts/lib/suggestedContactsList'

const titleKey: Record<ContactsListSectionKey, TranslationKey> = {
  ...suggestedSectionTitleKey,
  other: 'suggested_otherContacts',
}

/** The small uppercase title above each section of the Contacts list. */
export function ContactsListSectionHeader({
  section,
}: {
  section: ContactsListSectionKey
}) {
  return (
    <SuggestedSectionHeader
      title={i18n.t(titleKey[section])}
      section={section}
      testID={`contacts-section-${section}`}
    />
  )
}

/**
 * Space between Contacts list items: the usual gap between rows, a tighter one
 * under a section title, and more room before the next section starts.
 */
export function ContactsListSeparator({
  leadingItem,
  trailingItem,
}: {
  leadingItem?: ContactsListItem
  trailingItem?: ContactsListItem
}) {
  const height =
    leadingItem?.kind === 'header'
      ? 8
      : trailingItem?.kind === 'header'
        ? 24
        : 12
  return <View style={{ height }} />
}
