import {
  Footprints as FootprintsIcon,
  Pin as PinIcon,
} from 'lucide-react-native'
import Text from '@/components/ui/MyText'
import i18n from '@/lib/locales'
import DismissableCard from '@/components/DismissableCard'
import { Visit } from '@/types/visit'
import { ThemeContext } from '@/contexts/theme'
import { useContext, useMemo } from 'react'
import { View } from 'react-native'
import IconButton from '@/components/ui/IconButton'
import ApproachingConversationRow from '@/features/visits/components/ApproachingConversationsRow'
import moment from 'moment'

interface Props {
  conversations: Visit[]
}

const ApproachingConversations = ({ conversations }: Props) => {
  const theme = useContext(ThemeContext)

  const conversationsSortedByFollowUpDate = useMemo(
    () =>
      [...conversations].sort(
        (a, b) =>
          moment(a.followUp?.date).unix() - moment(b.followUp?.date).unix()
      ),
    [conversations]
  )

  if (conversations.length === 0) return null

  const now = moment()
  const endOfDay = moment().endOf('day').hour(16) // 4:59:59 PM
  const isMorning = now.isBefore(endOfDay)

  const titleIcon = isMorning ? FootprintsIcon : PinIcon
  const titleLabel = isMorning
    ? i18n.t('todaysConversations')
    : i18n.t('upcomingConversations')

  return (
    <DismissableCard
      titleColor={theme.colors.accent}
      title={
        <View
          style={{
            flexDirection: 'row',
            gap: 10,
            alignItems: 'center',
          }}
        >
          <IconButton
            icon={titleIcon}
            iconStyle={{ color: theme.colors.accent }}
          />
          <Text
            style={{
              fontSize: theme.fontSize('xl'),
              color: theme.colors.accent,
              fontFamily: theme.fonts.bold,
              flex: 1,
            }}
          >
            {titleLabel}
          </Text>
        </View>
      }
      style={{
        borderColor: theme.colors.accent,
        borderWidth: 1,
        borderRadius: theme.numbers.borderRadiusLg,
      }}
    >
      {conversationsSortedByFollowUpDate.map((c) => (
        <ApproachingConversationRow key={c.id} conversation={c} />
      ))}
    </DismissableCard>
  )
}

export default ApproachingConversations
