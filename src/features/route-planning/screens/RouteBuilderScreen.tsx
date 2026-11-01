import { useEffect, useEffectEvent, useState, type ReactNode } from 'react'
import {
  I18nManager,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native'
import Animated, {
  useAnimatedRef,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import {
  useNavigation,
  useRoute,
  type RouteProp,
} from '@react-navigation/native'
import * as Crypto from 'expo-crypto'
import moment from 'moment'
import { toast } from '@/stores/toasts'
import useTheme from '@/contexts/theme'
import DisplayRegionsView, {
  type DisplayDivision,
} from '../../../../modules/display-regions'
import { getFoldSplit } from '@/lib/foldSplit'
import useAdaptiveLayout from '@/hooks/useAdaptiveLayout'
import useFeatureAccess from '@/hooks/useFeatureAccess'
import i18n, { type TranslationKey } from '@/lib/locales'
import type { RootStackNavigation, RootStackParamList } from '@/types/rootStack'
import AddRouteStopSheet, {
  type AddRouteStopMode,
} from '@/features/route-planning/components/AddRouteStopSheet'
import RouteActionBar from '@/features/route-planning/components/RouteActionBar'
import RouteDayHeader from '@/features/route-planning/components/RouteDayHeader'
import RouteDetails from '@/features/route-planning/components/RouteDetails'
import RouteMap, {
  type DroppedPin,
} from '@/features/route-planning/components/RouteMap'
import RouteSplitHandle from '@/features/route-planning/components/RouteSplitHandle'
import RouteSupporterPreview from '@/features/route-planning/components/RouteSupporterPreview'
import RouteTimeline from '@/features/route-planning/components/RouteTimeline'
import useRouteBuilder from '@/features/route-planning/hooks/useRouteBuilder'
import { contactStop } from '@/features/route-planning/lib/contactStop'
import { coordinateText } from '@/features/route-planning/lib/coordinateText'
import type { SavedPlaceKind } from '@/features/route-planning/lib/routeBuilder'
import useContacts from '@/stores/contactsStore'

const PANEL_WIDTH = 420

export type RouteBuddiesSlot = {
  dayPlanId?: string

  onCreatePlan: () => void
}

export default function RouteBuilderScreen({
  renderBuddies,
}: {
  renderBuddies?: (slot: RouteBuddiesSlot) => ReactNode
}) {
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  const { height } = useWindowDimensions()
  const { isWide } = useAdaptiveLayout()
  const params = useRoute<RouteProp<RootStackParamList, 'TodayRoute'>>().params
  const navigation = useNavigation<RootStackNavigation>()

  const [day, setDay] = useState(() =>
    params?.date ? moment(params.date, 'YYYY-MM-DD').toDate() : new Date()
  )
  const builder = useRouteBuilder(day)
  const { hasAccess } = useFeatureAccess('routePlanning')
  const scrollRef = useAnimatedRef<Animated.ScrollView>()
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const [sheet, setSheet] = useState<{
    mode: AddRouteStopMode
    saving?: SavedPlaceKind
  } | null>(null)

  const [splitWidth, setSplitWidth] = useState(0)
  const [divisions, setDivisions] = useState<DisplayDivision[]>([])
  const mapMin = 160
  const mapMax = Math.max(mapMin, height * 0.7)
  const mapHeight = useSharedValue(Math.max(240, Math.min(440, height * 0.38)))

  const mapStyle = useAnimatedStyle(() =>
    isWide ? { flex: 1, height: '100%' } : { flex: 0, height: mapHeight.value }
  )

  const changeDay = (next: Date) => {
    setDay(next)
    setSelectedKey(null)
  }

  const linkFromParams = useEffectEvent((planId: string, newPlan: boolean) => {
    if (builder.linkedPlan?.id !== planId) {
      builder.linkPlan(planId, newPlan ? 'new_plan' : 'plan')
    }
    navigation.setParams({ planId: undefined, newPlan: undefined })
  })
  useEffect(() => {
    if (params?.planId) linkFromParams(params.planId, !!params.newPlan)
  }, [params?.planId, params?.newPlan])

  const addFromParams = useEffectEvent((ids: string[]) => {
    const { contacts } = useContacts.getState()
    const { leftOff } = builder.addContactStops(
      ids.flatMap((id) => {
        const contact = contacts.find((c) => c.id === id)
        return contact?.coordinate
          ? [contactStop({ ...contact, coordinate: contact.coordinate })]
          : []
      }),
      'contacts_map'
    )
    if (leftOff > 0) {
      toast.info(
        i18n.t('routeBuilder_contactsLeftOff' as TranslationKey, {
          count: leftOff,
        })
      )
    }
    navigation.setParams({ addContactIds: undefined })
  })
  useEffect(() => {
    if (params?.addContactIds?.length) addFromParams(params.addContactIds)
  }, [params?.addContactIds])

  const pinStop = (pin: DroppedPin) => ({
    key: `place:${Crypto.randomUUID()}`,
    kind: 'place' as const,
    title: pin.title ?? i18n.t('routeBuilder_pinnedPlace'),
    subtitle: `${pin.coordinate.latitude.toFixed(5)}, ${pin.coordinate.longitude.toFixed(5)}`,
    coordinate: pin.coordinate,
    destination: coordinateText(pin.coordinate),
  })

  const buddies = builder.linkedPlan?.recurring
    ? undefined
    : renderBuddies?.({
        dayPlanId: builder.linkedPlan?.id,
        onCreatePlan: () =>
          navigation.navigate('PlanDay', {
            date: day.toISOString(),
            prefill: builder.planPrefill,
          }),
      })

  const map = (
    <RouteMap
      stops={builder.stops}
      timeline={builder.timeline}
      roads={builder.roads}
      origin={builder.origin}
      originCoordinate={builder.originCoordinate}
      finish={builder.finish}
      finishCoordinate={builder.finishCoordinate}
      selectedKey={selectedKey}
      onSelect={setSelectedKey}
      onAddPin={(pin) => builder.addStop(pinStop(pin), 'map_pin')}
      onStartAtPin={(pin) => {
        const { key: _key, kind: _kind, ...place } = pinStop(pin)
        builder.setOrigin({ kind: 'place', ...place })
      }}
      onFinishAtPin={(pin) => {
        const { key: _key, kind: _kind, ...place } = pinStop(pin)
        builder.setFinish({ kind: 'place', ...place })
      }}
      canAdd={builder.canAdd}
      bottomInset={isWide ? insets.bottom : 0}
      style={{ flex: 1 }}
    />
  )

  const list = (
    <Animated.ScrollView
      ref={scrollRef}
      scrollEnabled={!dragging}
      keyboardShouldPersistTaps='handled'
      keyboardDismissMode='interactive'
      contentContainerStyle={{
        padding: 16,
        gap: 24,
        paddingBottom: 32,
        ...(!hasAccess && { paddingBottom: insets.bottom + 32 }),
      }}
    >
      <RouteDayHeader day={day} builder={builder} onChangeDay={changeDay} />
      <RouteTimeline
        builder={builder}
        selectedKey={selectedKey}
        scrollRef={scrollRef}
        dragging={dragging}
        onDragChange={setDragging}
        onSelect={(key) =>
          setSelectedKey((current) => (current === key ? null : key))
        }
        onAddStop={() => setSheet({ mode: 'stop' })}
        onChoosePlace={(end) => setSheet({ mode: end })}
        onSetSavedPlace={(kind, end) => setSheet({ mode: end, saving: kind })}
        onNavigateTo={builder.navigateTo}
      />
      <RouteDetails builder={builder} buddies={buddies} />
      {!hasAccess && <RouteSupporterPreview />}
    </Animated.ScrollView>
  )

  const actions = hasAccess ? (
    <RouteActionBar builder={builder} bottomInset={insets.bottom} />
  ) : null

  const panel =
    isWide && splitWidth > 0
      ? getFoldSplit({
          width: splitWidth,
          paddingHorizontal: 0,
          gap: 0,
          leading: { width: PANEL_WIDTH },
          minColumnWidth: 220,
          divisions,
          rtl: I18nManager.isRTL,
        })
      : { leadingWidth: PANEL_WIDTH, gap: 0 }

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      {}
      <View
        style={{ flex: 1, flexDirection: isWide ? 'row-reverse' : 'column' }}
        onLayout={(e) => setSplitWidth(e.nativeEvent.layout.width)}
      >
        <DisplayRegionsView
          style={StyleSheet.absoluteFill}
          onRegionsChange={(regions) => setDivisions(regions.divisions)}
        />
        <Animated.View style={mapStyle}>{map}</Animated.View>
        {!isWide && (
          <RouteSplitHandle height={mapHeight} min={mapMin} max={mapMax} />
        )}
        <View
          style={
            isWide
              ? {
                  width: panel.leadingWidth,
                  marginEnd: panel.gap,
                  borderEndWidth: 1,
                  borderEndColor: theme.colors.border,
                }
              : { flex: 1 }
          }
        >
          <View style={{ flex: 1 }}>{list}</View>
          {actions}
        </View>
      </View>

      <AddRouteStopSheet
        open={sheet !== null}
        mode={sheet?.mode ?? 'stop'}
        saving={sheet?.saving}
        around={builder.originCoordinate ?? builder.stops[0]?.coordinate}
        onRouteContactIds={builder.contactIds}
        onClose={() => setSheet(null)}
        onPick={(stop, source, savedPlace) => {
          const { key: _key, kind: _kind, ...place } = stop
          if (sheet?.mode === 'start') {
            builder.setOrigin({ kind: 'place', ...place, savedPlace })
          } else if (sheet?.mode === 'finish') {
            builder.setFinish({ kind: 'place', ...place, savedPlace })
          } else {
            builder.addStop(stop, source)
          }
        }}
      />
    </View>
  )
}
