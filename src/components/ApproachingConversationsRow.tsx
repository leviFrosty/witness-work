import { useContext, useMemo } from 'react'
import { View } from 'react-native'
import { ThemeContext } from '../contexts/theme'
import Card from './Card'
import { Conversation } from '../types/conversation'
import Text from './MyText'
import useContacts from '../stores/contactsStore'
import moment from 'moment'
import i18n from '../lib/locales'
import Button from './Button'
import { useNavigation } from '@react-navigation/native'
import IconButton from './IconButton'
import {
  faBell,
  faBellSlash,
  faChevronRight,
} from '@fortawesome/free-solid-svg-icons'
import { RootStackNavigation } from '../types/rootStack'

const ApproachingConversationRow = ({
  conversation,
  isOverdue = false,
}: {
  conversation: Conversation
  /**
   * When true, the row renders with the warn-color border + an "Overdue" pill
   * and tap navigates to the Reschedule sheet instead of Contact Details. Same
   * UX as tapping an overdue follow-up from the Appointments widget so users
   * get one consistent flow regardless of entry point.
   */
  isOverdue?: boolean
}) => {
  const theme = useContext(ThemeContext)
  const { contacts } = useContacts()
  const navigation = useNavigation<RootStackNavigation>()

  const contact = useMemo(() => {
    return contacts.find((c) => c.id === conversation.contact.id)
  }, [contacts, conversation.contact.id])

  if (!contact) {
    return
  }

  return (
    <Button
      onPress={() => {
        if (isOverdue) {
          navigation.navigate('RescheduleConversation', {
            contactId: contact.id,
            conversationId: conversation.id,
          })
        } else {
          navigation.navigate('Contact Details', {
            id: contact.id,
            highlightedConversationId: conversation.id,
          })
        }
      }}
    >
      <Card
        style={{
          backgroundColor: theme.colors.backgroundLighter,
          paddingVertical: 10,
          gap: 30,
          flexDirection: 'row',
          alignItems: 'center',
          ...(isOverdue
            ? {
                borderLeftWidth: 3,
                borderLeftColor: theme.colors.warn,
              }
            : {}),
        }}
      >
        <View style={{ gap: 5 }}>
          <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
            <Text style={{ fontFamily: theme.fonts.semiBold }}>
              {contact.name}
            </Text>
            {isOverdue ? (
              <View
                style={{
                  backgroundColor: theme.colors.warn,
                  paddingHorizontal: 6,
                  paddingVertical: 2,
                  borderRadius: theme.numbers.borderRadiusSm,
                }}
              >
                <Text
                  style={{
                    fontSize: 9,
                    color: theme.colors.textInverse,
                    fontFamily: theme.fonts.bold,
                  }}
                >
                  {i18n.t('overdue').toUpperCase()}
                </Text>
              </View>
            ) : null}
          </View>
          <Text>{moment(conversation.followUp?.date).fromNow()}</Text>
          <View style={{ flexDirection: 'row', gap: 5, alignItems: 'center' }}>
            <Text
              style={{
                fontSize: theme.fontSize('xs'),
                color: theme.colors.textAlt,
              }}
            >
              {moment(conversation.followUp?.date).format('LT')}
            </Text>
            <IconButton
              icon={conversation.followUp?.notifyMe ? faBell : faBellSlash}
              size='xs'
            />
          </View>
        </View>
        <View style={{ flex: 1, gap: 3 }}>
          <Text
            style={{
              fontSize: theme.fontSize('xs'),
              color: theme.colors.textAlt,
            }}
          >
            {i18n.t('topic')}
          </Text>
          <Text>
            {conversation.followUp?.topic || i18n.t('noTopicProvided')}
          </Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <IconButton icon={faChevronRight} />
        </View>
      </Card>
    </Button>
  )
}

export default ApproachingConversationRow
