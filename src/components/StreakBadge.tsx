import {
  Flame as FlameIcon,
  Hourglass as HourglassIcon,
} from 'lucide-react-native'
import { View } from 'react-native'
import LucideIcon from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'

const SIZES = {
  sm: { icon: 12, text: 12, paddingH: 7, paddingV: 2 },
  md: { icon: 14, text: 14, paddingH: 9, paddingV: 4 },
} as const

/**
 * A Service Streak: its count beside a flame. Kept Plans and months aren't
 * named; the number reads the same for every role. With `endsIn`, the time left
 * before it ends follows an hourglass.
 */
export default function StreakBadge({
  count,
  size = 'md',
  endsIn,
}: {
  count: number
  size?: keyof typeof SIZES
  endsIn?: string
}) {
  const theme = useTheme()
  const dims = SIZES[size]
  return (
    <View
      accessible
      accessibilityLabel={
        endsIn
          ? i18n.t('streakEndingAccessibilityLabel', { count, time: endsIn })
          : i18n.t('streakAccessibilityLabel', { count })
      }
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 3,
        paddingHorizontal: dims.paddingH,
        paddingVertical: dims.paddingV,
        borderRadius: 999,
        backgroundColor: endsIn
          ? theme.colors.warnTranslucent
          : theme.colors.orangeTranslucent,
      }}
    >
      <LucideIcon
        icon={FlameIcon}
        size={dims.icon}
        color={theme.colors.orange}
        fill={theme.colors.orange}
      />
      <Text
        style={{
          fontFamily: theme.fonts.bold,
          fontSize: dims.text,
          color: theme.colors.orange,
          fontVariant: ['tabular-nums'],
        }}
      >
        {count.toLocaleString()}
      </Text>
      {endsIn && (
        <>
          <LucideIcon
            icon={HourglassIcon}
            size={dims.icon - 1}
            color={theme.colors.warnText}
            style={{ marginLeft: 4 }}
          />
          <Text
            style={{
              fontFamily: theme.fonts.semiBold,
              fontSize: dims.text - 1,
              color: theme.colors.warnText,
              fontVariant: ['tabular-nums'],
            }}
          >
            {endsIn}
          </Text>
        </>
      )}
    </View>
  )
}
