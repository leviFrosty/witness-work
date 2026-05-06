import Text from './MyText'
import i18n from '../lib/locales'
import CardWithTitle from './CardWithTitle'
import { Conversation } from '../types/conversation'
import { ThemeContext } from '../contexts/theme'
import { useContext, useMemo } from 'react'
import { View } from 'react-native'
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome'
import IconButton from './IconButton'
import ApproachingConversationRow from './ApproachingConversationsRow'
import moment from 'moment'
import {
  faPersonRunning,
  faThumbtack,
  faTimes,
  faTriangleExclamation,
} from '@fortawesome/free-solid-svg-icons'

interface Props {
  conversations: Conversation[]
  overdueConversations?: Conversation[]
  onDismissMissedConversations?: () => void
}

const ApproachingConversations = ({
  conversations,
  overdueConversations = [],
  onDismissMissedConversations,
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

  const overdueCount = overdueSortedByFollowUpDate.length

  return (
    <CardWithTitle
      title={
        <View
          style={{
            flexDirection: 'row',
            gap: 10,
            alignItems: 'center',
          }}
        >
          {hasOverdue ? (
            <View
              style={{
                width: 28,
                height: 28,
                borderRadius: 14,
                backgroundColor: theme.colors.warnTranslucent,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <FontAwesomeIcon icon={titleIcon} size={14} color={accentColor} />
            </View>
          ) : (
            <IconButton icon={titleIcon} iconStyle={{ color: accentColor }} />
          )}
          <Text
            style={{
              fontSize: theme.fontSize('xl'),
              color: accentColor,
              fontFamily: theme.fonts.bold,
              flex: 1,
            }}
          >
            {titleLabel}
          </Text>
          {hasOverdue && overdueCount > 1 ? (
            <View
              style={{
                paddingHorizontal: 8,
                paddingVertical: 2,
                borderRadius: 10,
                backgroundColor: theme.colors.warnTranslucent,
                minWidth: 24,
                alignItems: 'center',
              }}
            >
              <Text
                style={{
                  fontSize: theme.fontSize('xs'),
                  color: accentColor,
                  fontFamily: theme.fonts.bold,
                }}
              >
                {overdueCount}
              </Text>
            </View>
          ) : null}
          {hasOverdue && onDismissMissedConversations ? (
            <IconButton
              icon={faTimes}
              color={theme.colors.textAlt}
              onPress={onDismissMissedConversations}
            />
          ) : null}
        </View>
      }
      titlePosition='inside'
      titleColor={accentColor}
      style={{
        borderColor: accentColor,
        borderWidth: 1,
        borderRadius: theme.numbers.borderRadiusLg,
      }}
      cardStyle={
        hasOverdue
          ? { backgroundColor: theme.colors.warnTranslucent }
          : undefined
      }
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
