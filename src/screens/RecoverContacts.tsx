import { Alert, ScrollView, View } from 'react-native'
import Text from '../components/MyText'
import useTheme from '../contexts/theme'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import useContacts from '../stores/contactsStore'
import moment from 'moment'
import Card from '../components/Card'
import useConversations from '../stores/conversationStore'
import { FlashList } from '@shopify/flash-list'
import i18n from '../lib/locales'
import { useMemo } from 'react'
import Wrapper from '../components/layout/Wrapper'
import IconButton from '../components/IconButton'
import { faTrash, faUndo } from '@fortawesome/free-solid-svg-icons'

const RecoverContacts = () => {
  const theme = useTheme()
  const { conversations, deleteConversation } = useConversations()
  const { deletedContacts, recoverContact, removeDeletedContact } =
    useContacts()
  const insets = useSafeAreaInsets()

  const handleRemoveDeleted = (id: string) => {
    removeDeletedContact(id)
    const conversationsToDelete = conversations.filter(
      (convo) => convo.contact.id === id
    )
    conversationsToDelete.forEach((cToDelete) =>
      deleteConversation(cToDelete.id)
    )
  }

  const sortedContacts = useMemo(
    () =>
      deletedContacts.sort((a, b) =>
        moment(a.createdAt).unix() < moment(b.createdAt).unix() ? 1 : -1
      ),
    [deletedContacts]
  )

  return (
    <Wrapper
      insets='none'
      style={{
        flex: 1,
        flexGrow: 1,
        justifyContent: 'space-between',
      }}
    >
      <View style={{ flexGrow: 1 }}>
        <View style={{ padding: 25, gap: 5 }}>
          <Text style={{ fontSize: 32, fontFamily: theme.fonts.bold }}>
            {i18n.t('recoverContacts')}
          </Text>
          <Text style={{ color: theme.colors.textAlt, fontSize: 12 }}>
            {i18n.t('recoverContacts_description')}
          </Text>
        </View>
        <ScrollView
          style={{ marginBottom: insets.bottom + 60 }}
          contentInset={{
            top: 0,
            right: 0,
            bottom: insets.bottom + 30,
            left: 0,
          }}
        >
          <View
            style={{
              gap: 20,
              paddingHorizontal: 10,
              marginBottom: insets.bottom,
            }}
          >
            {deletedContacts.length === 0 && (
              <Text style={{ paddingHorizontal: 20 }}>
                {i18n.t('deletedContactsWillAppearHere')}
              </Text>
            )}
            <View style={{ minHeight: 2 }}>
              <FlashList
                data={sortedContacts}
                estimatedItemSize={87}
                renderItem={({ item }) => (
                  <View style={{ padding: 6 }}>
                    <Card
                      key={item.id}
                      style={{
                        flexDirection: 'row',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                      }}
                    >
                      <View style={{ gap: 5 }}>
                        <Text
                          style={{
                            fontSize: 10,
                            fontFamily: theme.fonts.semiBold,
                            color: theme.colors.textAlt,
                          }}
                        >
                          {`${i18n.t('created')} ${moment(
                            item.createdAt
                          ).format('LL')}`}
                        </Text>
                        <View
                          style={{
                            flexDirection: 'row',
                            gap: 10,
                            alignItems: 'center',
                          }}
                        >
                          <IconButton
                            onPress={() => recoverContact(item.id)}
                            icon={faUndo}
                          />
                          <Text>{item.name}</Text>
                        </View>
                      </View>
                      <IconButton
                        icon={faTrash}
                        onPress={() =>
                          Alert.alert(
                            i18n.t('permanentlyDelete'),
                            i18n.t('permanentlyDeleteContact_warning'),
                            [
                              {
                                text: i18n.t('cancel'),
                                style: 'cancel',
                              },
                              {
                                text: i18n.t('delete'),
                                style: 'destructive',
                                onPress: () => {
                                  handleRemoveDeleted(item.id)
                                },
                              },
                            ]
                          )
                        }
                      />
                    </Card>
                  </View>
                )}
              />
            </View>
          </View>
        </ScrollView>
      </View>
    </Wrapper>
  )
}

export default RecoverContacts
