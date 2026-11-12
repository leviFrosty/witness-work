import { View } from 'react-native'
import {
  Check as CheckIcon,
  CircleCheck as CircleCheckIcon,
  Circle as CircleIcon,
} from 'lucide-react-native'
import LucideIcon from '@/components/ui/LucideIcon'
import useTheme from '@/contexts/theme'

export default function PickMark({
  picked,
  single = false,
  dimmed = false,
}: {
  picked: boolean
  single?: boolean
  dimmed?: boolean
}) {
  const theme = useTheme()
  if (single)
    return (
      <LucideIcon
        icon={picked ? CircleCheckIcon : CircleIcon}
        size={22}
        color={picked ? theme.colors.accent : theme.colors.border}
      />
    )
  return picked ? (
    <View
      style={{
        width: 22,
        height: 22,
        borderRadius: 11,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: dimmed ? theme.colors.textAlt : theme.colors.accent,
      }}
    >
      <LucideIcon
        icon={CheckIcon}
        size={14}
        strokeWidth={3}
        color={theme.colors.textInverse}
      />
    </View>
  ) : (
    <View
      style={{
        width: 22,
        height: 22,
        borderRadius: 11,
        borderWidth: 1.5,
        borderColor: theme.colors.textAlt,
        opacity: 0.6,
      }}
    />
  )
}
