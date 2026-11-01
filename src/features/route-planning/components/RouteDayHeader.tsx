import { View } from 'react-native'
import moment from 'moment'
import {
  ChevronBackwardIcon,
  ChevronForwardIcon,
} from '@/components/ui/DirectionalIcon'
import IconButton from '@/components/ui/IconButton'
import { touchTargetFrame } from '@/components/ui/touchTarget'
import InfoPopover from '@/components/ui/InfoPopover'
import Text from '@/components/ui/MyText'
import PointerTooltip from '@/components/ui/PointerTooltip'
import useTheme from '@/contexts/theme'
import { formatDate, formatDisplay, formatStartTime } from '@/lib/dates'
import i18n, { type TranslationKey } from '@/lib/locales'
import { formatMinutes } from '@/lib/minutes'
import { usePreferences } from '@/stores/preferences'
import type { RouteBuilder } from '@/features/route-planning/hooks/useRouteBuilder'
import {
  formatRouteDistance,
  formatRouteSummary,
} from '@/features/route-planning/lib/routeSummary'

export default function RouteDayHeader({
  day,
  builder,
  onChangeDay,
}: {
  day: Date
  builder: RouteBuilder
  onChangeDay: (day: Date) => void
}) {
  const theme = useTheme()
  const timeDisplayFormat = usePreferences((s) => s.timeDisplayFormat)
  const distanceUnit = usePreferences((s) => s.distanceUnit)
  const date = moment(day)
  const today = moment().startOf('day')
  const relative = date.isSame(today, 'day')
    ? i18n.t('today')
    : date.isSame(today.clone().add(1, 'day'), 'day')
      ? i18n.t('tomorrow')
      : null
  const { timeline, stops } = builder

  const facts = [
    i18n.t('routeBuilder_stopCount' as TranslationKey, { count: stops.length }),
    stops.length > 0 &&
      i18n.t('routeBuilder_timeRange', {
        start: formatStartTime(timeline.start),
        end: formatStartTime(timeline.end),
      }),
    timeline.driveMinutes > 0 &&
      i18n.t('routeBuilder_driving', {
        duration: formatMinutes(timeline.driveMinutes, timeDisplayFormat)
          .formatted,
      }),
    timeline.meters > 0 && formatRouteDistance(timeline.meters, distanceUnit),
  ].filter(Boolean)

  return (
    <View style={{ gap: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <PointerTooltip label={i18n.t('routeBuilder_previousDay')}>
          <IconButton
            icon={ChevronBackwardIcon}
            size={20}
            style={touchTargetFrame(20)}
            color={theme.colors.textAlt}
            accessibilityLabel={i18n.t('routeBuilder_previousDay')}
            onPress={() =>
              onChangeDay(date.clone().subtract(1, 'day').toDate())
            }
          />
        </PointerTooltip>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text
            style={{
              fontSize: theme.fontSize('lg'),
              fontFamily: theme.fonts.bold,
            }}
          >
            {relative ?? date.format('dddd')}
          </Text>
          <Text
            style={{
              color: theme.colors.textAlt,
              fontSize: theme.fontSize('sm'),
            }}
          >
            {relative ? formatDisplay(date, 'dddd, LL') : formatDate(date)}
          </Text>
        </View>
        <PointerTooltip label={i18n.t('routeBuilder_nextDay')}>
          <IconButton
            icon={ChevronForwardIcon}
            size={20}
            style={touchTargetFrame(20)}
            color={theme.colors.textAlt}
            accessibilityLabel={i18n.t('routeBuilder_nextDay')}
            onPress={() => onChangeDay(date.clone().add(1, 'day').toDate())}
          />
        </PointerTooltip>
      </View>

      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          flexWrap: 'wrap',
        }}
      >
        <Text
          style={{
            color: theme.colors.textAlt,
            fontSize: theme.fontSize('sm'),
            textAlign: 'center',
          }}
        >
          {facts.join(' · ')}
        </Text>
        {stops.length > 1 && (
          <InfoPopover
            inline
            title={i18n.t('routeBuilder_estimateInfoTitle')}
            description={i18n.t('routeBuilder_estimateInfo')}
          />
        )}
      </View>
      {builder.optimized && (
        <Text
          style={{
            color: theme.colors.accent,
            fontSize: theme.fontSize('sm'),
            fontFamily: theme.fonts.semiBold,
            textAlign: 'center',
          }}
        >
          {i18n.t('routeBuilder_optimizedSummary', {
            summary: formatRouteSummary(builder.optimized, {
              timeDisplayFormat,
              distanceUnit,
            }),
          })}
        </Text>
      )}
    </View>
  )
}
