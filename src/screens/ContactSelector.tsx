import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view'
import Text from '../components/MyText'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { FlashList } from '@shopify/flash-list'
import useContacts from '../stores/contactsStore'
import { View } from 'react-native'
import SearchBar from '../components/SearchBar'
import { useState, useContext } from 'react'
import { useNavigation } from '@react-navigation/native'
import { RootStackNavigation } from '../stacks/RootStack'
import Divider from '../components/Divider'
import ContactRow from '../components/ContactRow'
import i18n from '../lib/locales'
import Wrapper from '../components/layout/Wrapper'
import { ThemeContext } from '../contexts/theme'

const ContactSelector = () => {
  const theme = useContext(ThemeContext)
  const navigation = useNavigation<RootStackNavigation>()
  const { contacts } = useContacts()
  const insets = useSafeAreaInsets()
  const [search, setSearch] = useState('')

  const searchResults = contacts.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <Wrapper
      insets='none'
      style={{ flexGrow: 1, paddingTop: 20, paddingHorizontal: 20, gap: 20 }}
    >
      <View style={{ gap: 20 }}>
        <Text style={{ fontSize: 32, fontFamily: theme.fonts.bold }}>
          {i18n.t('assignContact')}
        </Text>
        <SearchBar value={search} setValue={setSearch} />
      </View>
      <KeyboardAwareScrollView style={{ flexGrow: 1, paddingHorizontal: 10 }}>
        <View
          style={{
            flex: 1,
            flexGrow: 1,
            minHeight: 20,
            marginBottom: insets.bottom + insets.top + 50,
          }}
        >
          <FlashList
            data={searchResults}
            renderItem={({ item: contact }) => (
              <ContactRow
                contact={contact}
                onPress={() =>
                  navigation.replace('Conversation Form', {
                    contactId: contact.id,
                  })
                }
              />
            )}
            ItemSeparatorComponent={() => (
              <Divider borderStyle='dashed' marginVertical={10} />
            )}
            estimatedItemSize={16}
          />
        </View>
      </KeyboardAwareScrollView>
    </Wrapper>
  )
}

export default ContactSelector
