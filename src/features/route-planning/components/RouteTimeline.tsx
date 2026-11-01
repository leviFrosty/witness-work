import { View } from 'react-native'
import type Animated from 'react-native-reanimated'
import type { AnimatedRef } from 'react-native-reanimated'
import {
  CirclePlus as CirclePlusIcon,
  Plus as PlusIcon,
} from 'lucide-react-native'
import Button from '@/components/ui/Button'
import IconButton from '@/components/ui/IconButton'
import InfoPopover from '@/components/ui/InfoPopover'
import LucideIcon from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'
import PointerTooltip from '@/components/ui/PointerTooltip'
import SortableList from '@/components/ui/SortableList'
import useTheme from '@/contexts/theme'
import { formatStartTime } from '@/lib/dates'
import i18n, { type TranslationKey } from '@/lib/locales'
import { usePreferences } from '@/stores/preferences'
import RouteSectionLabel from '@/features/route-planning/components/RouteSectionLabel'
import RouteTimelineFinish from '@/features/route-planning/components/RouteTimelineFinish'
import RouteTimelineStart from '@/features/route-planning/components/RouteTimelineStart'
import RouteTimelineStop, {
  STOP_HANDLE_WIDTH,
} from '@/features/route-planning/components/RouteTimelineStop'
import type { RouteBuilder } from '@/features/route-planning/hooks/useRouteBuilder'
import type { SavedPlaceKind } from '@/features/route-planning/lib/routeBuilder'
import { MAX_ROUTE_STOPS } from '@/features/route-planning/lib/routeLimits'
import { useSavedPlaces } from '@/features/route-planning/stores/savedPlaces'

export type RouteEnd = 'start' | 'finish'

export default function RouteTimeline({
  builder,
  selectedKey,
  scrollRef,
  dragging,
  onDragChange,
  onSelect,
  onAddStop,
  onChoosePlace,
  onSetSavedPlace,
  onNavigateTo,
}: {
  builder: RouteBuilder
  selectedKey: string | null
  scrollRef: AnimatedRef<Animated.ScrollView>
  dragging: boolean
  onDragChange: (dragging: boolean) => void
  onSelect: (key: string) => void
  onAddStop: () => void

  onChoosePlace: (end: RouteEnd) => void

  onSetSavedPlace: (kind: SavedPlaceKind, end: RouteEnd) => void
  onNavigateTo: (key: string) => void
}) {
  const theme = useTheme()
  const distanceUnit = usePreferences((s) => s.distanceUnit)
  const savedPlaces = useSavedPlaces((s) => s.places)
  const { stops, timeline, removed } = builder
  const entries = new Map(timeline.entries.map((entry) => [entry.key, entry]))
  const startsAtFirstStop = builder.origin.kind === 'firstStop'

  return (
    <View>
      <RouteTimelineStart
        origin={builder.origin}
        startTime={builder.startTime}
        planOptions={builder.planOptions}
        savedPlaces={savedPlaces}
        hasStops={stops.length > 0}
        onChangeOrigin={builder.setOrigin}
        onChoosePlace={() => onChoosePlace('start')}
        onSetSavedPlace={(kind) => onSetSavedPlace(kind, 'start')}
        onChangeStartTime={builder.setStartTime}
      />

      <SortableList
        data={stops}
        keyExtractor={(stop) => stop.key}
        scrollRef={scrollRef}
        handleWidth={STOP_HANDLE_WIDTH}
        onDragChange={onDragChange}
        onReorder={(next) => builder.setOrder(next.map((stop) => stop.key))}
        renderItem={(stop, index) => (
          <RouteTimelineStop
            stop={stop}
            entry={entries.get(stop.key)}
            position={index + 1}
            isLast={false}
            showLeg
            hideLegDetails={dragging || (index === 0 && startsAtFirstStop)}
            selected={selectedKey === stop.key}
            distanceUnit={distanceUnit}
            canMoveUp={index > 0}
            canMoveDown={index < stops.length - 1}
            onSelect={() => onSelect(stop.key)}
            onMove={(by) => builder.move(stop.key, by)}
            onSetStay={(minutes) => builder.setStay(stop.key, minutes)}
            onNavigate={() => onNavigateTo(stop.key)}
            onRemove={() => builder.remove(stop.key)}
          />
        )}
      />

      {stops.length > 0 && (
        <RouteTimelineFinish
          finish={builder.finish}
          lastStopTitle={stops[stops.length - 1]?.title}
          end={timeline.end}
          leg={timeline.finishLeg}
          savedPlaces={savedPlaces}
          hideLegDetails={dragging}
          distanceUnit={distanceUnit}
          onChangeFinish={builder.setFinish}
          onChoosePlace={() => onChoosePlace('finish')}
          onSetSavedPlace={(kind) => onSetSavedPlace(kind, 'finish')}
        />
      )}

      {stops.length === 0 && (
        <Text
          style={{
            marginTop: 12,
            color: theme.colors.textAlt,
            fontSize: theme.fontSize('sm'),
          }}
        >
          {i18n.t('routeBuilder_noStops')}
        </Text>
      )}

      <Button
        onPress={onAddStop}
        disabled={!builder.canAdd}
        accessibilityLabel={i18n.t('routeBuilder_addStop')}
        style={{
          marginTop: 16,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          paddingVertical: 12,
          borderRadius: theme.numbers.borderRadiusMd,
          borderCurve: 'continuous',
          borderWidth: 1.5,
          borderStyle: 'dashed',
          borderColor: theme.colors.accent,
          opacity: builder.canAdd ? 1 : 0.5,
        }}
      >
        <LucideIcon icon={PlusIcon} size={16} color={theme.colors.accent} />
        <Text
          style={{
            color: theme.colors.accent,
            fontFamily: theme.fonts.semiBold,
          }}
        >
          {i18n.t('routeBuilder_addStop')}
        </Text>
      </Button>
      {!builder.canAdd && (
        <Text
          style={{
            marginTop: 6,
            color: theme.colors.textAlt,
            fontSize: theme.fontSize('sm'),
          }}
        >
          {i18n.t('routePlan_stopLimit', { max: MAX_ROUTE_STOPS })}
        </Text>
      )}

      {removed.length > 0 && (
        <View style={{ gap: 8, marginTop: 20 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <RouteSectionLabel>
              {i18n.t('routePlan_removedCount', { count: removed.length })}
            </RouteSectionLabel>
            {builder.missingLocationCount > 0 && (
              <InfoPopover
                inline
                title={i18n.t('routePlan_stopsInfoTitle')}
                description={i18n.t(
                  'routePlan_missingLocation' as TranslationKey,
                  { count: builder.missingLocationCount }
                )}
              />
            )}
          </View>
          {removed.map((stop) => (
            <View
              key={stop.key}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 10,
                paddingVertical: 8,
                paddingHorizontal: 12,
                borderRadius: theme.numbers.borderRadiusMd,
                backgroundColor: theme.colors.card,
              }}
            >
              <View style={{ flex: 1, gap: 2 }}>
                <Text
                  numberOfLines={1}
                  style={{ fontFamily: theme.fonts.semiBold }}
                >
                  {stop.title}
                </Text>
                <Text
                  numberOfLines={1}
                  style={{
                    color: theme.colors.textAlt,
                    fontSize: theme.fontSize('sm'),
                  }}
                >
                  {stop.setTime !== undefined
                    ? i18n.t('routeBuilder_setFor', {
                        time: formatStartTime(stop.setTime),
                      })
                    : stop.subtitle}
                </Text>
              </View>
              {builder.canAdd && (
                <PointerTooltip label={i18n.t('routePlan_addStopBack')}>
                  <IconButton
                    icon={CirclePlusIcon}
                    size={22}
                    color={theme.colors.accent}
                    accessibilityLabel={i18n.t('routePlan_addStopBackNamed', {
                      name: stop.title,
                    })}
                    onPress={() => builder.restore(stop.key)}
                  />
                </PointerTooltip>
              )}
            </View>
          ))}
        </View>
      )}
    </View>
  )
}
