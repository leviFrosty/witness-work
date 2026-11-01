import { View } from 'react-native'
import moment from 'moment'
import {
  ChevronDown as ChevronDownIcon,
  Play as PlayIcon,
} from 'lucide-react-native'
import DateTimePicker from '@/components/ui/DateTimePicker'
import LucideIcon from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'
import PullDownMenu from '@/components/ui/PullDownMenu'
import useTheme from '@/contexts/theme'
import { formatStartTime } from '@/lib/dates'
import { atMinutesOfDay } from '@/lib/normalizeDate'
import i18n from '@/lib/locales'
import { RailDot } from '@/features/route-planning/components/RouteTimelineRail'
import type { RoutePlanOption } from '@/features/route-planning/hooks/useRouteBuilder'
import type {
  RouteOrigin,
  SavedPlace,
  SavedPlaceKind,
} from '@/features/route-planning/lib/routeBuilder'
import { savedPlaceActions } from '@/features/route-planning/lib/savedPlaceMenu'

export default function RouteTimelineStart({
  origin,
  startTime,
  planOptions,
  savedPlaces,
  hasStops,
  onChangeOrigin,
  onChoosePlace,
  onSetSavedPlace,
  onChangeStartTime,
}: {
  origin: RouteOrigin
  startTime: number
  planOptions: RoutePlanOption[]
  savedPlaces: Partial<Record<SavedPlaceKind, SavedPlace>>
  hasStops: boolean
  onChangeOrigin: (origin: RouteOrigin) => void
  onChoosePlace: () => void
  onSetSavedPlace: (kind: SavedPlaceKind) => void
  onChangeStartTime: (minutes: number) => void
}) {
  const theme = useTheme()
  const label =
    origin.kind === 'place'
      ? origin.title
      : origin.kind === 'firstStop'
        ? i18n.t('routeBuilder_firstStop')
        : i18n.t('routePlan_currentLocation')
  const placedPlans = planOptions.filter((plan) => plan.place)
  const customPlace =
    origin.kind === 'place' && !origin.stopKey && !origin.savedPlace
      ? origin
      : null

  return (
    <View style={{ flexDirection: 'row' }}>
      <RailDot filled={false} lineBelow={hasStops}>
        <LucideIcon icon={PlayIcon} size={12} color={theme.colors.accent} />
      </RailDot>
      <View
        style={{
          flex: 1,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          marginLeft: 6,
          paddingLeft: 10,
          paddingRight: 8,
          paddingVertical: 8,
          borderRadius: theme.numbers.borderRadiusMd,
          borderCurve: 'continuous',
          backgroundColor: theme.colors.card,
        }}
      >
        <View style={{ flex: 1, gap: 3 }}>
          <Text
            style={{
              color: theme.colors.accent,
              fontFamily: theme.fonts.bold,
              fontSize: theme.fontSize('sm'),
            }}
          >
            {i18n.t('routeBuilder_start')}
          </Text>
          <PullDownMenu
            accessibilityLabel={i18n.t('routePlan_startFrom')}
            accessibilityValue={label}
            hoverRadius={8}
            actions={[
              [
                {
                  id: 'current',
                  title: i18n.t('routePlan_currentLocation'),
                  systemImage: 'location',
                  checked: origin.kind === 'currentLocation',
                  onPress: () => onChangeOrigin({ kind: 'currentLocation' }),
                },
                {
                  id: 'first',
                  title: i18n.t('routeBuilder_firstStop'),
                  systemImage: '1.circle',
                  checked: origin.kind === 'firstStop',
                  onPress: () => onChangeOrigin({ kind: 'firstStop' }),
                },
                ...savedPlaceActions({
                  places: savedPlaces,
                  checked:
                    origin.kind === 'place' ? origin.savedPlace : undefined,
                  onPick: (kind, place) =>
                    onChangeOrigin({
                      kind: 'place',
                      ...place,
                      savedPlace: kind,
                    }),
                  onSet: onSetSavedPlace,
                }),
              ],
              placedPlans.map((plan) => ({
                id: plan.stopKey,
                title: `${plan.place!.title} · ${formatStartTime(plan.time)}`,
                systemImage: 'calendar',
                checked:
                  origin.kind === 'place' && origin.stopKey === plan.stopKey,
                onPress: () =>
                  onChangeOrigin({
                    kind: 'place',
                    ...plan.place!,
                    stopKey: plan.stopKey,
                  }),
              })),
              [
                customPlace && {
                  id: 'custom',
                  title: customPlace.title,
                  systemImage: 'mappin',
                  checked: true,
                  onPress: () => {},
                },
                {
                  id: 'choose',
                  title: i18n.t('routeBuilder_choosePlace'),
                  systemImage: 'magnifyingglass',
                  onPress: onChoosePlace,
                },
              ],
            ]}
          >
            <View
              style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
            >
              <Text
                numberOfLines={1}
                style={{ flexShrink: 1, fontFamily: theme.fonts.semiBold }}
              >
                {label}
              </Text>
              <LucideIcon
                icon={ChevronDownIcon}
                size={14}
                color={theme.colors.textAlt}
              />
            </View>
          </PullDownMenu>
          {origin.kind === 'place' && origin.subtitle ? (
            <Text
              numberOfLines={1}
              style={{
                color: theme.colors.textAlt,
                fontSize: theme.fontSize('sm'),
              }}
            >
              {origin.subtitle}
            </Text>
          ) : null}
        </View>
        <View accessibilityLabel={i18n.t('routeBuilder_leaveAt')}>
          <DateTimePicker
            iOSMode='time'
            value={atMinutesOfDay(moment(), startTime).toDate()}
            onChange={(_event, date) => {
              if (!date) return
              const picked = moment(date)
              onChangeStartTime(picked.hours() * 60 + picked.minutes())
            }}
          />
        </View>
      </View>
    </View>
  )
}
