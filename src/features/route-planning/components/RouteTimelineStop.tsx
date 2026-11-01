import { View } from 'react-native'
import {
  CalendarDays as CalendarDaysIcon,
  Clock as ClockIcon,
  Ellipsis as EllipsisIcon,
  GripVertical as GripVerticalIcon,
  MapPin as MapPinIcon,
  TriangleAlert as TriangleAlertIcon,
  User as UserIcon,
} from 'lucide-react-native'
import Button from '@/components/ui/Button'
import LucideIcon, { type AppIcon } from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'
import PointerTooltip from '@/components/ui/PointerTooltip'
import PullDownMenu from '@/components/ui/PullDownMenu'
import useTheme from '@/contexts/theme'
import { formatStartTime } from '@/lib/dates'
import i18n from '@/lib/locales'
import { formatMinutesCompact } from '@/lib/minutes'
import type { DistanceUnit } from '@/types/mileage'
import RouteTimelineLeg from '@/features/route-planning/components/RouteTimelineLeg'
import {
  LEG_HEIGHT,
  RailDot,
} from '@/features/route-planning/components/RouteTimelineRail'
import {
  STAY_CHOICES,
  type BuilderStop,
  type BuilderStopKind,
} from '@/features/route-planning/lib/routeBuilder'
import type { TimelineEntry } from '@/features/route-planning/lib/routeTimeline'

export const STOP_HANDLE_WIDTH = 44

const KIND_ICONS: Record<BuilderStopKind, AppIcon> = {
  followUp: UserIcon,
  contact: UserIcon,
  plan: CalendarDaysIcon,
  place: MapPinIcon,
}

export default function RouteTimelineStop({
  stop,
  entry,
  position,
  isLast,
  showLeg,
  hideLegDetails,
  selected,
  distanceUnit,
  canMoveUp,
  canMoveDown,
  onSelect,
  onMove,
  onSetStay,
  onNavigate,
  onRemove,
}: {
  stop: BuilderStop
  entry: TimelineEntry | undefined
  position: number
  isLast: boolean

  showLeg: boolean

  hideLegDetails: boolean
  selected: boolean
  distanceUnit?: DistanceUnit
  canMoveUp: boolean
  canMoveDown: boolean
  onSelect: () => void
  onMove: (by: number) => void
  onSetStay: (minutes: number) => void
  onNavigate: () => void
  onRemove: () => void
}) {
  const theme = useTheme()

  const arrive = entry ? formatStartTime(entry.begin) : ''
  const small = { fontSize: theme.fontSize('sm') }
  const late = entry?.lateMinutes ?? 0

  return (
    <View>
      {showLeg ? (
        <RouteTimelineLeg
          leg={entry?.leg}
          wait={entry && { arrive: entry.arrive, minutes: entry.waitMinutes }}
          hideDetails={hideLegDetails}
          distanceUnit={distanceUnit}
        />
      ) : (
        <View style={{ height: LEG_HEIGHT }} />
      )}

      <View style={{ flexDirection: 'row' }}>
        <RailDot lineBelow={!isLast}>
          <Text
            maxFontSizeMultiplier={1.2}
            style={{
              color: theme.colors.textInverse,
              fontFamily: theme.fonts.bold,
              fontSize: theme.fontSize('sm'),
            }}
          >
            {position}
          </Text>
        </RailDot>

        {}
        <View
          style={{
            flex: 1,
            flexDirection: 'row',
            marginLeft: 6,
            marginBottom: isLast ? 0 : 4,
            borderRadius: theme.numbers.borderRadiusMd,
            borderCurve: 'continuous',
            backgroundColor: selected
              ? theme.colors.accentTranslucent
              : theme.colors.card,
          }}
        >
          <View style={{ flex: 1, paddingBottom: 10 }}>
            <Button
              onPress={onSelect}
              accessibilityLabel={i18n.t('routeBuilder_stopA11y', {
                position,
                name: stop.title,
                time: arrive,
              })}
              accessibilityActions={[
                ...(canMoveUp
                  ? [{ name: 'moveUp', label: i18n.t('moveUp') }]
                  : []),
                ...(canMoveDown
                  ? [{ name: 'moveDown', label: i18n.t('moveDown') }]
                  : []),
              ]}
              onAccessibilityAction={(e) =>
                onMove(e.nativeEvent.actionName === 'moveUp' ? -1 : 1)
              }
              style={{
                gap: 3,
                paddingTop: 8,
                paddingBottom: 6,
                paddingLeft: 10,
                borderRadius: theme.numbers.borderRadiusMd,
              }}
            >
              <Text
                style={{
                  ...small,
                  color: late ? theme.colors.warnText : theme.colors.accent,
                  fontFamily: theme.fonts.bold,
                }}
              >
                {arrive}
              </Text>
              <Text
                numberOfLines={1}
                style={{ fontFamily: theme.fonts.semiBold }}
              >
                {stop.title}
              </Text>
              {stop.subtitle ? (
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 5,
                  }}
                >
                  <LucideIcon
                    icon={KIND_ICONS[stop.kind]}
                    size={12}
                    color={theme.colors.textAlt}
                  />
                  <Text
                    numberOfLines={1}
                    style={{
                      ...small,
                      flexShrink: 1,
                      color: theme.colors.textAlt,
                    }}
                  >
                    {stop.subtitle}
                  </Text>
                </View>
              ) : null}
            </Button>
            <View
              style={{
                flexDirection: 'row',
                flexWrap: 'wrap',
                gap: 6,
                paddingLeft: 10,
              }}
            >
              {late > 0 && stop.setTime !== undefined ? (
                <StopChip
                  icon={TriangleAlertIcon}
                  tone='warn'
                  label={`${i18n.t('routeBuilder_setFor', {
                    time: formatStartTime(stop.setTime),
                  })} · ${i18n.t('routeBuilder_late', {
                    duration: formatMinutesCompact(late),
                  })}`}
                />
              ) : stop.setTime !== undefined ? (
                <StopChip
                  label={i18n.t('routeBuilder_setFor', {
                    time: formatStartTime(stop.setTime),
                  })}
                />
              ) : null}
              <PullDownMenu
                accessibilityLabel={i18n.t('routeBuilder_timeHere')}
                accessibilityValue={formatMinutesCompact(stop.stayMinutes)}
                actions={STAY_CHOICES.map((minutes) => ({
                  id: `stay-${minutes}`,
                  title: formatMinutesCompact(minutes),
                  checked: minutes === stop.stayMinutes,
                  onPress: () => onSetStay(minutes),
                }))}
                hoverRadius={999}
              >
                <StopChip
                  icon={ClockIcon}
                  tone='accent'
                  label={i18n.t('routeBuilder_stay', {
                    duration: formatMinutesCompact(stop.stayMinutes),
                  })}
                />
              </PullDownMenu>
            </View>
          </View>

          {}
          <View style={{ width: STOP_HANDLE_WIDTH, alignItems: 'center' }}>
            <PullDownMenu
              accessibilityLabel={i18n.t('routeBuilder_stopOptionsNamed', {
                name: stop.title,
              })}
              actions={[
                [
                  {
                    id: 'navigate',
                    title: i18n.t('routeBuilder_navigateHere'),
                    systemImage: 'location.fill',
                    onPress: onNavigate,
                  },
                ],
                [
                  canMoveUp && {
                    id: 'up',
                    title: i18n.t('moveUp'),
                    systemImage: 'arrow.up',
                    onPress: () => onMove(-1),
                  },
                  canMoveDown && {
                    id: 'down',
                    title: i18n.t('moveDown'),
                    systemImage: 'arrow.down',
                    onPress: () => onMove(1),
                  },
                ],
                [
                  {
                    id: 'remove',
                    title: i18n.t('routeBuilder_removeStop'),
                    systemImage: 'minus.circle',
                    destructive: true,
                    onPress: onRemove,
                  },
                ],
              ]}
              hoverRadius={8}
            >
              <View
                style={{
                  width: 36,
                  height: 34,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <LucideIcon
                  icon={EllipsisIcon}
                  size={18}
                  color={theme.colors.textAlt}
                />
              </View>
            </PullDownMenu>
            <PointerTooltip
              label={i18n.t('routeBuilder_dragToReorder')}
              style={{ flex: 1, alignSelf: 'stretch' }}
            >
              <View
                accessibilityElementsHidden
                importantForAccessibility='no-hide-descendants'
                style={{
                  flex: 1,
                  minHeight: 30,
                  alignItems: 'center',
                  justifyContent: 'center',
                  paddingBottom: 4,
                }}
              >
                <LucideIcon
                  icon={GripVerticalIcon}
                  size={18}
                  color={theme.colors.textAlt}
                />
              </View>
            </PointerTooltip>
          </View>
        </View>
      </View>
    </View>
  )
}

function StopChip({
  label,
  icon,
  tone = 'neutral',
}: {
  label: string
  icon?: AppIcon
  tone?: 'neutral' | 'accent' | 'warn'
}) {
  const theme = useTheme()
  const color =
    tone === 'warn'
      ? theme.colors.warnText
      : tone === 'accent'
        ? theme.colors.text
        : theme.colors.textAlt
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 999,
        backgroundColor:
          tone === 'warn'
            ? theme.colors.warnTranslucent
            : theme.colors.backgroundLightest,
      }}
    >
      {icon && <LucideIcon icon={icon} size={11} color={color} />}
      <Text
        numberOfLines={1}
        style={{
          fontSize: theme.fontSize('xs') + 1,
          color,
          fontFamily: theme.fonts.medium,
        }}
      >
        {label}
      </Text>
    </View>
  )
}
