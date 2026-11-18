import { useNavigation } from '@react-navigation/native'
import ContactDetailsContent from '@/features/contacts/components/ContactDetailsContent'
import i18n from '@/lib/locales'
import type { RootStackNavigation } from '@/types/rootStack'

export default function MapContactDetailPane({
  contactId,
  onClose,
}: {
  contactId: string
  onClose: () => void
}) {
  const navigation = useNavigation<RootStackNavigation>()
  return (
    <ContactDetailsContent
      key={contactId}
      id={contactId}
      navigation={navigation}
      embedded
      back={{ label: i18n.t('map_backToContactList'), onPress: onClose }}
    />
  )
}
