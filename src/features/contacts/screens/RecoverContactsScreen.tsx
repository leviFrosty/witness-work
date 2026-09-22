import { Trash2 as Trash2Icon, Undo2 as Undo2Icon } from 'lucide-react-native'
import { Alert, ScrollView, View } from 'react-native'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import useContacts from '@/stores/contactsStore'
import moment from 'moment'
import { formatDate } from '@/lib/dates'
import Card from '@/components/ui/Card'
import Empty from '@/components/ui/Empty'
import useConversations from '@/stores/conversationStore'
import { FlashList } from '@shopify/flash-list'
import i18n from '@/lib/locales'
import Wrapper from '@/components/ui/layout/Wrapper'
import IconButton from '@/components/ui/IconButton'
import { useToastController } from '@tamagui/toast'
import { isRedactedContactTombstone } from '@/lib/dataProtection'

const RecoverContactsScreen = () => {
  const theme = useTheme()
  const { conversations, deleteConversation } = useConversations()
  const { deletedContacts, recoverContact, removeDeletedContact } =
    useContacts()
  const toast = useToastController()
  const insets = useSafeAreaInsets()

  const handleRemoveDeleted = (id: string) => {
    removeDeletedContact(id)
    const conversationsToDelete = conversations.filter(
      (convo) => convo.contact.id === id
    )
    conversationsToDelete.forEach((cToDelete) =>
      deleteConversation(cToDelete.id)
    )
    toast.show(i18n.t('success'), {
      message: i18n.t('deleted'),
      native: true,
    })
  }

  const recover = (id: string) => {
    recoverContact(id)
    toast.show(i18n.t('success'), {
      message: i18n.t('recovered'),
      native: true,
    })
  }

  // Tombstones written by a data-protection hard delete keep nothing but an id
  // and a timestamp, so there is nothing to show and nothing to restore. They
  // stay in the store (iCloud needs them to propagate the deletion) but are
  // filtered out here rather than rendered as blank, un-recoverable rows.
  const recoverable = deletedContacts.filter(
    (c) => !isRedactedContactTombstone(c)
  )

  const sortedContacts = [...recoverable].sort((a, b) =>
    moment(a.createdAt).unix() < moment(b.createdAt).unix() ? 1 : -1
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
          style={{ paddingBottom: insets.bottom + 60 }}
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
            {recoverable.length === 0 && (
              <Empty title={i18n.t('deletedContactsWillAppearHere')} />
            )}
            <View style={{ minHeight: 2 }}>
              <FlashList
                data={sortedContacts}
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
                          {`${i18n.t('created')} ${formatDate(item.createdAt)}`}
                        </Text>
                        <View
                          style={{
                            flexDirection: 'row',
                            gap: 10,
                            alignItems: 'center',
                          }}
                        >
                          <IconButton
                            onPress={() => recover(item.id)}
                            icon={Undo2Icon}
                          />
                          <Text>{item.name}</Text>
                        </View>
                      </View>
                      <IconButton
                        icon={Trash2Icon}
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

export default RecoverContactsScreen
