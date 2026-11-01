import { View, type StyleProp, type ViewStyle } from 'react-native'
import { Flag as FlagIcon, Play as PlayIcon } from 'lucide-react-native'
import LucideIcon, { type AppIcon } from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import { formatStartTime } from '@/lib/dates'
import i18n from '@/lib/locales'
import { formatMinutesCompact } from '@/lib/minutes'

export default function RouteMapSpan({
  start,
  end,
  style,
}: {
  start: number
  end: number
  style?: StyleProp<ViewStyle>
}) {
  const theme = useTheme()
  const startTime = formatStartTime(start)
  const endTime = formatStartTime(end)
  const length = formatMinutesCompact(Math.max(0, end - start))

  return (
    <View
      accessible
      accessibilityLabel={`${i18n.t('routeBuilder_startAt', { time: startTime })}, ${i18n.t('routeBuilder_finishAtTime', { time: endTime })}, ${length}`}
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
          paddingVertical: 6,
          paddingHorizontal: 12,
          borderRadius: theme.numbers.borderRadiusMd,
          borderCurve: 'continuous',
          backgroundColor: theme.colors.card,
          borderWidth: 1,
          borderColor: theme.colors.border,
          shadowColor: '#000',
          shadowOpacity: 0.12,
          shadowRadius: 6,
          shadowOffset: { width: 0, height: 2 },
          elevation: 3,
        },
        style,
      ]}
    >
      <SpanEnd
        icon={PlayIcon}
        label={i18n.t('routeBuilder_start')}
        time={startTime}
      />
      <View style={{ alignItems: 'center', gap: 2 }}>
        <Text
          maxFontSizeMultiplier={1.3}
          style={{
            fontSize: theme.fontSize('xs'),
            color: theme.colors.textAlt,
          }}
        >
          {length}
        </Text>
        <View
          style={{ width: 36, height: 2, backgroundColor: theme.colors.border }}
        />
      </View>
      <SpanEnd
        icon={FlagIcon}
        label={i18n.t('routeBuilder_finish')}
        time={endTime}
      />
    </View>
  )
}

function SpanEnd({
  icon,
  label,
  time,
}: {
  icon: AppIcon
  label: string
  time: string
}) {
  const theme = useTheme()
  return (
    <View style={{ gap: 1 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
        <LucideIcon icon={icon} size={10} color={theme.colors.accent} />
        <Text
          maxFontSizeMultiplier={1.3}
          style={{
            fontSize: theme.fontSize('xs'),
            fontFamily: theme.fonts.semiBold,
            color: theme.colors.textAlt,
          }}
        >
          {label}
        </Text>
      </View>
      <Text
        maxFontSizeMultiplier={1.3}
        style={{ fontSize: theme.fontSize('sm'), fontFamily: theme.fonts.bold }}
      >
        {time}
      </Text>
    </View>
  )
}
