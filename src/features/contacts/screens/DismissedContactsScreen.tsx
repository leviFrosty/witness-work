import { Clock as ClockIcon } from 'lucide-react-native'
import { View } from 'react-native'
import { NativeStackScreenProps } from '@react-navigation/native-stack'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { FlashList } from '@shopify/flash-list'
import moment from 'moment'
import Wrapper from '@/components/ui/layout/Wrapper'
import Empty from '@/components/ui/Empty'
import LucideIcon from '@/components/ui/LucideIcon'
import useTheme from '@/contexts/theme'
import useContacts from '@/stores/contactsStore'
import { getDismissedContacts } from '@/lib/dismissedContacts'
import { RootStackParamList } from '@/types/rootStack'
import i18n from '@/lib/locales'
import DismissedContactRow from '@/features/contacts/components/DismissedContactRow'
import DismissedContactsHeader from '@/features/contacts/components/DismissedContactsHeader'
import DismissedContactsSelectionBar from '@/features/contacts/components/DismissedContactsSelectionBar'
import { SELECTION_BAR_HEIGHT } from '@/features/contacts/components/ListSelection'
import useListSelection from '@/features/contacts/hooks/useListSelection'

type Props = NativeStackScreenProps<RootStackParamList, 'Dismissed Contacts'>

const DismissedContactsScreen = ({ navigation }: Props) => {
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  const { contacts } = useContacts()

  // Soonest to return first.
  const dismissedContacts = getDismissedContacts(contacts).sort((a, b) => {
    if (!a.dismissedUntil) return 1
    if (!b.dismissedUntil) return -1
    return moment(a.dismissedUntil).unix() - moment(b.dismissedUntil).unix()
  })

  const selection = useListSelection(
    'dismissed_contacts',
    dismissedContacts.map((contact) => contact.id)
  )
  const selectedIds = new Set(selection.ids)
  const selectedContacts = dismissedContacts.filter((contact) =>
    selectedIds.has(contact.id)
  )

  return (
    <Wrapper insets='none'>
      <View style={{ padding: 12 }}>
        <DismissedContactsHeader
          selection={selection}
          canSelect={dismissedContacts.length > 0}
        />
      </View>
      <View style={{ flex: 1 }}>
        <FlashList
          data={dismissedContacts}
          extraData={`${selection.selecting}:${selection.ids.join()}`}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <DismissedContactRow
              contact={item}
              selectionMode={selection.selecting}
              checked={selection.isSelected(item.id)}
              onPress={() =>
                selection.selecting
                  ? selection.toggle(item.id)
                  : navigation.navigate('Contact Details', { id: item.id })
              }
            />
          )}
          ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
          ListEmptyComponent={
            <Empty
              icon={
                <LucideIcon
                  icon={ClockIcon}
                  size={24}
                  color={theme.colors.text}
                />
              }
              title={i18n.t('noDismissedContacts_title')}
              description={i18n.t('noDismissedContacts_description')}
            />
          }
          contentContainerStyle={{
            paddingHorizontal: 12,
            paddingBottom:
              insets.bottom +
              16 +
              (selection.selecting ? SELECTION_BAR_HEIGHT + 12 : 0),
          }}
        />
      </View>
      {selection.selecting && (
        <DismissedContactsSelectionBar
          contacts={selectedContacts}
          selection={selection}
          bottom={insets.bottom + 12}
        />
      )}
    </Wrapper>
  )
}

export default DismissedContactsScreen
