import { View } from 'react-native'
import {
  ChevronDown as ChevronDownIcon,
  Flag as FlagIcon,
} from 'lucide-react-native'
import LucideIcon from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'
import PullDownMenu from '@/components/ui/PullDownMenu'
import useTheme from '@/contexts/theme'
import { formatStartTime } from '@/lib/dates'
import i18n from '@/lib/locales'
import type { DistanceUnit } from '@/types/mileage'
import RouteTimelineLeg from '@/features/route-planning/components/RouteTimelineLeg'
import { RailDot } from '@/features/route-planning/components/RouteTimelineRail'
import type {
  RouteFinish,
  SavedPlace,
  SavedPlaceKind,
} from '@/features/route-planning/lib/routeBuilder'
import { savedPlaceActions } from '@/features/route-planning/lib/savedPlaceMenu'
import type { TimelineLeg } from '@/features/route-planning/lib/routeTimeline'

export default function RouteTimelineFinish({
  finish,
  lastStopTitle,
  end,
  leg,
  savedPlaces,
  hideLegDetails,
  distanceUnit,
  onChangeFinish,
  onChoosePlace,
  onSetSavedPlace,
}: {
  finish: RouteFinish
  lastStopTitle?: string

  end: number

  leg?: TimelineLeg
  savedPlaces: Partial<Record<SavedPlaceKind, SavedPlace>>
  hideLegDetails: boolean
  distanceUnit?: DistanceUnit
  onChangeFinish: (finish: RouteFinish) => void
  onChoosePlace: () => void
  onSetSavedPlace: (kind: SavedPlaceKind) => void
}) {
  const theme = useTheme()
  const label =
    finish.kind === 'place'
      ? finish.title
      : finish.kind === 'start'
        ? i18n.t('routeBuilder_backToStart')
        : i18n.t('routeBuilder_lastStop')
  const subtitle =
    finish.kind === 'place'
      ? finish.subtitle
      : finish.kind === 'lastStop'
        ? lastStopTitle
        : undefined
  const customPlace =
    finish.kind === 'place' && !finish.savedPlace ? finish : null

  return (
    <View>
      {finish.kind === 'lastStop' ? (
        <RouteTimelineLeg />
      ) : (
        <RouteTimelineLeg
          leg={leg}
          hideDetails={hideLegDetails}
          distanceUnit={distanceUnit}
        />
      )}
      <View style={{ flexDirection: 'row' }}>
        <RailDot filled={false} lineBelow={false}>
          <LucideIcon icon={FlagIcon} size={13} color={theme.colors.accent} />
        </RailDot>
        <View
          style={{
            flex: 1,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
            marginLeft: 6,
            paddingLeft: 10,
            paddingRight: 12,
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
              {i18n.t('routeBuilder_finish')}
            </Text>
            <PullDownMenu
              accessibilityLabel={i18n.t('routeBuilder_finishPlace')}
              accessibilityValue={label}
              hoverRadius={8}
              actions={[
                [
                  {
                    id: 'last',
                    title: i18n.t('routeBuilder_lastStop'),
                    systemImage: 'mappin.and.ellipse',
                    checked: finish.kind === 'lastStop',
                    onPress: () => onChangeFinish({ kind: 'lastStop' }),
                  },
                  {
                    id: 'start',
                    title: i18n.t('routeBuilder_backToStart'),
                    systemImage: 'arrow.uturn.backward',
                    checked: finish.kind === 'start',
                    onPress: () => onChangeFinish({ kind: 'start' }),
                  },
                  ...savedPlaceActions({
                    places: savedPlaces,
                    checked:
                      finish.kind === 'place' ? finish.savedPlace : undefined,
                    onPick: (kind, place) =>
                      onChangeFinish({
                        kind: 'place',
                        ...place,
                        savedPlace: kind,
                      }),
                    onSet: onSetSavedPlace,
                  }),
                ],
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
            {subtitle ? (
              <Text
                numberOfLines={1}
                style={{
                  color: theme.colors.textAlt,
                  fontSize: theme.fontSize('sm'),
                }}
              >
                {subtitle}
              </Text>
            ) : null}
          </View>
          <Text style={{ color: theme.colors.textAlt }}>
            {i18n.t('routeBuilder_finishAround', {
              time: formatStartTime(end),
            })}
          </Text>
        </View>
      </View>
    </View>
  )
}
