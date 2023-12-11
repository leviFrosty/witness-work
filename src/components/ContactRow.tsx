import { View, Alert } from 'react-native'
import Text from './MyText'
import useTheme from '../contexts/theme'
import Card from './Card'
import { Contact } from '../types/contact'
import useConversations from '../stores/conversationStore'
import { useMemo } from 'react'
import moment from 'moment'
import i18n from '../lib/locales'
import {
  contactHasAtLeastOneStudy,
  contactStudiedForGivenMonth,
} from '../lib/conversations'
import IconButton from './IconButton'
import { faBook, faChevronRight } from '@fortawesome/free-solid-svg-icons'
import Button from './Button'
import { Swipeable } from 'react-native-gesture-handler'
import Haptics from '../lib/haptics'
import useContacts from '../stores/contactsStore'
import SwipeableArchive from './swipeableActions/Archive'

const ContactRow = ({
  contact,
  onPress,
}: {
  contact: Contact
  onPress?: () => void
}) => {
  const theme = useTheme()
  const { deleteContact } = useContacts()
  const { conversations } = useConversations()
  const { name } = contact

  const isActiveBibleStudy = contactStudiedForGivenMonth({
    contact,
    conversations,
    month: new Date(),
  })

  const hasStudiedPreviously = contactHasAtLeastOneStudy({
    conversations,
    contact,
  })

  const mostRecentConversation = useMemo(() => {
    const filteredConversations = conversations.filter(
      (c) => c.contact.id === contact.id
    )
    const sortedConversations = filteredConversations.sort((a, b) =>
      moment(a.date).unix() < moment(b.date).unix() ? 1 : -1
    )

    return sortedConversations.length > 0 ? sortedConversations[0] : null
  }, [contact.id, conversations])

  const handleSwipeOpen = (
    direction: 'left' | 'right',
    swipeable: Swipeable
  ) => {
    if (direction === 'right') {
      Alert.alert(
        i18n.t('archiveContact_question'),
        i18n.t('archiveContact_description'),
        [
          {
            text: i18n.t('cancel'),
            style: 'cancel',
            onPress: () => swipeable.reset(),
          },
          {
            text: i18n.t('delete'),
            style: 'destructive',
            onPress: () => {
              swipeable.reset()
              deleteContact(contact.id)
            },
          },
        ]
      )
    }
  }

  return (
    <Button onPress={onPress}>
      <Card
        style={{
          backgroundColor: theme.colors.backgroundLighter,
        }}
      >
        <Swipeable
          onSwipeableWillOpen={() => Haptics.light()}
          containerStyle={{ backgroundColor: theme.colors.backgroundLighter }}
          renderRightActions={() => <SwipeableArchive size='sm' />}
          onSwipeableOpen={handleSwipeOpen}
        >
          <View style={{ alignItems: 'center', flexDirection: 'row' }}>
            <View style={{ flexGrow: 1, gap: 2 }}>
              <Text style={{ fontSize: 18 }}>{name}</Text>
              <Text style={{ color: theme.colors.textAlt, fontSize: 10 }}>
                {mostRecentConversation
                  ? moment(mostRecentConversation.date).fromNow()
                  : i18n.t('noRecentConversation_plural')}
              </Text>
            </View>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              {hasStudiedPreviously && (
                <IconButton
                  iconStyle={{
                    color: isActiveBibleStudy
                      ? theme.colors.text
                      : theme.colors.textAlt,
                  }}
                  icon={faBook}
                />
              )}
              <IconButton
                iconStyle={{
                  color: isActiveBibleStudy
                    ? theme.colors.text
                    : theme.colors.textAlt,
                }}
                icon={faChevronRight}
              />
            </View>
          </View>
        </Swipeable>
      </Card>
    </Button>
  )
}

export default ContactRow
