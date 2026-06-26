import { useContext, useMemo } from 'react'
import { View } from 'react-native'
import { ThemeContext } from '@/contexts/theme'
import Card from '@/components/ui/Card'
import { Visit } from '@/types/visit'
import Text from '@/components/ui/MyText'
import useContacts from '@/stores/contactsStore'
import Button from '@/components/ui/Button'
import { formatRelative } from '@/lib/dates'
import { useNavigation } from '@react-navigation/native'
import IconButton from '@/components/ui/IconButton'
import { faChevronRight } from '@fortawesome/free-solid-svg-icons'
import { RootStackNavigation } from '@/types/rootStack'

const ApproachingConversationRow = ({
  conversation,
  isOverdue = false,
}: {
  conversation: Visit
  /**
   * When true, tap navigates to the Reschedule sheet instead of Contact
   * Details. Same UX as tapping an overdue follow-up from the Appointments
   * widget so users get one consistent flow regardless of entry point.
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
          navigation.navigate('RescheduleVisit', {
            contactId: contact.id,
            visitId: conversation.id,
          })
        } else {
          navigation.navigate('Contact Details', {
            id: contact.id,
            highlightedVisitId: conversation.id,
          })
        }
      }}
    >
      <Card
        style={{
          backgroundColor: isOverdue
            ? theme.colors.card
            : theme.colors.backgroundLighter,
          paddingVertical: 12,
          gap: 12,
          flexDirection: 'row',
          alignItems: 'center',
          ...(isOverdue
            ? {
                borderRadius: theme.numbers.borderRadiusMd,
              }
            : {}),
        }}
      >
        <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
          <Text style={{ fontFamily: theme.fonts.semiBold }} numberOfLines={1}>
            {contact.name}
          </Text>
          <Text
            style={{
              fontSize: theme.fontSize('sm'),
              color: theme.colors.textAlt,
            }}
            numberOfLines={2}
          >
            {formatRelative(conversation.followUp?.date)}
            {conversation.followUp?.topic
              ? ` · ${conversation.followUp.topic}`
              : ''}
          </Text>
        </View>
        <IconButton icon={faChevronRight} />
      </Card>
    </Button>
  )
}

export default ApproachingConversationRow
