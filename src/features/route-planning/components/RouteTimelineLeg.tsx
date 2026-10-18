import { View } from 'react-native'
import { Car as CarIcon } from 'lucide-react-native'
import Text from '@/components/ui/MyText'
import TimelinePill from '@/components/ui/TimelinePill'
import useTheme from '@/contexts/theme'
import { formatStartTime } from '@/lib/dates'
import i18n from '@/lib/locales'
import { formatMinutesCompact } from '@/lib/minutes'
import type { DistanceUnit } from '@/types/mileage'
import {
  LEG_HEIGHT,
  RailLine,
} from '@/features/route-planning/components/RouteTimelineRail'
import { formatRouteDistance } from '@/features/route-planning/lib/routeSummary'
import type { TimelineLeg } from '@/features/route-planning/lib/routeTimeline'

/**
 * The space between two points on the route, drawn like the space between two
 * visits in a Contact's history: the drive as a pill on the line, then any wait
 * for the next stop's set time.
 */
export default function RouteTimelineLeg({
  leg,
  wait,
  hideDetails,
  distanceUnit,
}: {
  leg?: TimelineLeg
  /** Arriving early for a set time: when you'd get there and how long until. */
  wait?: { arrive: number; minutes: number }
  /** While stops move, drives are about to change; don't show stale ones. */
  hideDetails?: boolean
  distanceUnit?: DistanceUnit
}) {
  const theme = useTheme()
  const waiting = wait && wait.minutes > 0
  return (
    <View style={{ flexDirection: 'row', minHeight: LEG_HEIGHT }}>
      <RailLine />
      {(leg || waiting) && (
        <View
          style={{
            flex: 1,
            minWidth: 0,
            gap: 5,
            paddingVertical: 7,
            paddingLeft: 6,
            opacity: hideDetails ? 0 : 1,
          }}
        >
          {leg && (
            <TimelinePill
              icon={CarIcon}
              label={
                leg.minutes === 0
                  ? i18n.t('routeBuilder_samePlace')
                  : i18n.t('routeBuilder_leg', {
                      duration: formatMinutesCompact(leg.minutes),
                      distance: formatRouteDistance(leg.meters, distanceUnit),
                    })
              }
            />
          )}
          {waiting && (
            <Text
              style={{
                fontSize: theme.fontSize('sm'),
                lineHeight: 16,
                color: theme.colors.textAlt,
              }}
            >
              <Text style={{ fontFamily: theme.fonts.bold }}>
                {i18n.t('routeBuilder_wait', {
                  duration: formatMinutesCompact(wait.minutes),
                })}
              </Text>
              {` · ${i18n.t('routeBuilder_arriveEarly', {
                time: formatStartTime(wait.arrive),
              })}`}
            </Text>
          )}
        </View>
      )}
    </View>
  )
}
