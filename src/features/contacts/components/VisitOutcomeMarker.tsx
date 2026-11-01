import {
  BookOpen as BookOpenIcon,
  DoorClosed as DoorClosedIcon,
  MessageCircle as MessageCircleIcon,
} from 'lucide-react-native'
import { View } from 'react-native'
import LucideIcon from '@/components/ui/LucideIcon'
import useTheme from '@/contexts/theme'
import { VisitOutcome } from '@/features/contacts/lib/visitTimeline'

const OUTCOME_ICON = {
  study: BookOpenIcon,
  conversation: MessageCircleIcon,
  notAtHome: DoorClosedIcon,
} as const

const VisitOutcomeMarker = ({
  outcome,
  size,
  withIcon = false,
}: {
  outcome: VisitOutcome
  size: number

  withIcon?: boolean
}) => {
  const theme = useTheme()
  const style = {
    study: {
      backgroundColor: theme.colors.accent,
      borderColor: theme.colors.accent,
      color: theme.colors.card,
    },
    conversation: {
      backgroundColor: theme.colors.card,
      borderColor: theme.colors.accent3,
      color: theme.colors.accent3,
    },
    notAtHome: {
      backgroundColor: theme.colors.backgroundLighter,
      borderColor: theme.colors.textAlt,
      color: theme.colors.textAlt,
    },
  }[outcome]
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: outcome === 'notAtHome' ? size * 0.28 : size / 2,

        borderWidth: size < 16 ? 2 : 1.5,
        borderColor: style.borderColor,
        backgroundColor: style.backgroundColor,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {withIcon && (
        <LucideIcon
          icon={OUTCOME_ICON[outcome]}
          size={Math.round(size * 0.46)}
          color={style.color}
        />
      )}
    </View>
  )
}

export default VisitOutcomeMarker
