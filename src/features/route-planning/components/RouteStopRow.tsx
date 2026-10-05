import type { ReactNode } from 'react'
import { View } from 'react-native'
import {
  CalendarDays as CalendarDaysIcon,
  User as UserIcon,
} from 'lucide-react-native'
import LucideIcon from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'
import XView from '@/components/ui/layout/XView'
import useTheme from '@/contexts/theme'
import { formatStartTime } from '@/lib/dates'
import i18n from '@/lib/locales'
import type { RouteStop } from '@/features/route-planning/lib/routeStops'

/**
 * One stop: its kind (Follow-up or Plan) or its place in the order, the name,
 * time, and address line, plus an optional trailing control.
 */
export default function RouteStopRow({
  stop,
  position,
  badge,
  trailing,
  dimmed,
}: {
  stop: RouteStop
  /** 1-based place in a planned route; shows instead of the kind icon. */
  position?: number
  /** Short tag after the time, e.g. "Start". */
  badge?: string
  trailing?: ReactNode
  dimmed?: boolean
}) {
  const theme = useTheme()
  return (
    <XView
      style={{
        gap: 12,
        paddingVertical: 10,
        opacity: dimmed ? 0.5 : 1,
      }}
    >
      <View
        style={{
          width: 32,
          height: 32,
          borderRadius: 16,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor:
            position != null
              ? theme.colors.accent
              : theme.colors.accentTranslucent,
        }}
      >
        {position != null ? (
          <Text
            style={{
              color: theme.colors.textInverse,
              fontFamily: theme.fonts.bold,
              fontSize: theme.fontSize('sm'),
            }}
          >
            {position}
          </Text>
        ) : (
          <LucideIcon
            icon={stop.kind === 'followUp' ? UserIcon : CalendarDaysIcon}
            size={15}
            color={theme.colors.accent}
          />
        )}
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <XView style={{ gap: 8, justifyContent: 'space-between' }}>
          <Text
            numberOfLines={1}
            style={{ flexShrink: 1, fontFamily: theme.fonts.semiBold }}
          >
            {stop.title}
          </Text>
          <Text
            style={{
              color: theme.colors.textAlt,
              fontSize: theme.fontSize('sm'),
            }}
          >
            {badge
              ? i18n.t('routePlan_timeWithBadge', {
                  time: formatStartTime(stop.startTimeInMinutes),
                  badge,
                })
              : formatStartTime(stop.startTimeInMinutes)}
          </Text>
        </XView>
        {stop.subtitle ? (
          <Text
            numberOfLines={1}
            style={{
              color: theme.colors.textAlt,
              fontSize: theme.fontSize('sm'),
            }}
          >
            {stop.subtitle}
          </Text>
        ) : null}
      </View>
      {trailing}
    </XView>
  )
}
