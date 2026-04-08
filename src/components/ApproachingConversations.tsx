import Text from './MyText'
import i18n from '../lib/locales'
import CardWithTitle from './CardWithTitle'
import { Conversation } from '../types/conversation'
import { ThemeContext } from '../contexts/theme'
import { useContext, useMemo } from 'react'
import { View } from 'react-native'
import IconButton from './IconButton'
import ApproachingConversationRow from './ApproachingConversationsRow'
import moment from 'moment'
import {
  faPersonRunning,
  faThumbtack,
  faTriangleExclamation,
} from '@fortawesome/free-solid-svg-icons'

interface Props {
  conversations: Conversation[]
  overdueConversations?: Conversation[]
}

const ApproachingConversations = ({
  conversations,
  overdueConversations = [],
}: Props) => {
  const theme = useContext(ThemeContext)

  const now = moment()
  const endOfDay = moment().endOf('day').hour(16) // 4:59:59 PM

  const isMorning = now.isBefore(endOfDay)
  const hasOverdue = overdueConversations.length > 0

  const conversationsSortedByFollowUpDate = useMemo(
    () =>
      [...conversations].sort(
        (a, b) =>
          moment(a.followUp?.date).unix() - moment(b.followUp?.date).unix()
      ),
    [conversations]
  )

  // Most recently missed first — the user is most likely to act on the
  // freshest miss while it's still mentally close.
  const overdueSortedByFollowUpDate = useMemo(
    () =>
      [...overdueConversations].sort(
        (a, b) =>
          moment(b.followUp?.date).unix() - moment(a.followUp?.date).unix()
      ),
    [overdueConversations]
  )

  // Title and accent shift to the warn color when there are overdue items so
  // the section reads as "you have missed something" at a glance instead of
  // blending in with the normal upcoming list.
  const accentColor = hasOverdue ? theme.colors.warn : theme.colors.accent
  const titleIcon = hasOverdue
    ? faTriangleExclamation
    : isMorning
      ? faPersonRunning
      : faThumbtack
  const titleLabel = hasOverdue
    ? i18n.t('missedConversations')
    : isMorning
      ? i18n.t('todaysConversations')
      : i18n.t('upcomingConversations')

  return (
    <CardWithTitle
      title={
        <View style={{ flexDirection: 'row', gap: 5, alignItems: 'center' }}>
          <IconButton icon={titleIcon} iconStyle={{ color: accentColor }} />
          <Text
            style={{
              fontSize: theme.fontSize('xl'),
              color: accentColor,
              fontFamily: theme.fonts.bold,
            }}
          >
            {titleLabel}
          </Text>
        </View>
      }
      titlePosition='inside'
      titleColor={accentColor}
      style={{
        borderColor: accentColor,
        borderWidth: 1,
        borderRadius: theme.numbers.borderRadiusLg,
      }}
    >
      {overdueSortedByFollowUpDate.map((c) => (
        <ApproachingConversationRow key={c.id} conversation={c} isOverdue />
      ))}
      {conversationsSortedByFollowUpDate.map((c) => (
        <ApproachingConversationRow key={c.id} conversation={c} />
      ))}
    </CardWithTitle>
  )
}

export default ApproachingConversations
