import Text from '@/components/ui/MyText'
import i18n from '@/lib/locales'
import DismissableCard from '@/components/DismissableCard'
import { Visit } from '@/types/visit'
import { ThemeContext } from '@/contexts/theme'
import { useContext, useMemo } from 'react'
import { View } from 'react-native'
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome'
import ApproachingConversationRow from '@/features/visits/components/ApproachingConversationsRow'
import moment from 'moment'
import { faTriangleExclamation } from '@fortawesome/free-solid-svg-icons'

interface Props {
  conversations: Visit[]
}

const MissedConversations = ({ conversations }: Props) => {
  const theme = useContext(ThemeContext)

  // Most recently missed first — the user is most likely to act on the
  // freshest miss while it's still mentally close.
  const sorted = useMemo(
    () =>
      [...conversations].sort(
        (a, b) =>
          moment(b.followUp?.date).unix() - moment(a.followUp?.date).unix()
      ),
    [conversations]
  )

  if (conversations.length === 0) return null

  const accentColor = theme.colors.warn
  const headerColor = theme.colors.warnText
  const count = sorted.length

  return (
    <DismissableCard
      titleColor={headerColor}
      title={
        <View
          style={{
            flexDirection: 'row',
            gap: 10,
            alignItems: 'center',
          }}
        >
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
            <FontAwesomeIcon
              icon={faTriangleExclamation}
              size={14}
              color={headerColor}
            />
          </View>
          <Text
            style={{
              fontSize: theme.fontSize('xl'),
              color: headerColor,
              fontFamily: theme.fonts.bold,
              flex: 1,
            }}
          >
            {i18n.t('missedConversations')}
          </Text>
          {count > 1 ? (
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
                  color: headerColor,
                  fontFamily: theme.fonts.bold,
                }}
              >
                {count}
              </Text>
            </View>
          ) : null}
        </View>
      }
      style={{
        borderColor: accentColor,
        borderWidth: 1,
        borderRadius: theme.numbers.borderRadiusLg,
      }}
      cardStyle={{ backgroundColor: theme.colors.warnTranslucent }}
    >
      {sorted.map((c) => (
        <ApproachingConversationRow key={c.id} conversation={c} isOverdue />
      ))}
    </DismissableCard>
  )
}

export default MissedConversations
