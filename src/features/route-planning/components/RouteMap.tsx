import { useEffect, useEffectEvent, useRef, useState } from 'react'
import { View, type StyleProp, type ViewStyle } from 'react-native'
import MapView, { Marker, Polyline } from 'react-native-maps'
import { Scan as ScanIcon } from 'lucide-react-native'
import FloatingGlassButton from '@/components/ui/FloatingGlassButton'
import useTheme from '@/contexts/theme'
import { formatStartTime } from '@/lib/dates'
import i18n from '@/lib/locales'
import { usePreferences } from '@/stores/preferences'
import type { Coordinate } from '@/types/contact'
import DroppedPinCard from '@/features/route-planning/components/DroppedPinCard'
import RouteMapSpan from '@/features/route-planning/components/RouteMapSpan'
import { pinTitle } from '@/features/route-planning/lib/pinTitle'
import {
  MARKER_PIN,
  RouteMapCard,
  RouteMapPin,
} from '@/features/route-planning/components/RouteMapMarker'
import {
  MARKER_CARD_HEIGHT,
  MARKER_GAP,
  MARKER_POINTER,
} from '@/lib/mapMarkerMetrics'
import type {
  BuilderStop,
  RouteFinish,
  RouteOrigin,
} from '@/features/route-planning/lib/routeBuilder'
import {
  estimateCardWidth,
  placeLabels,
  type LabelCandidate,
  type MapRegion,
  type MapSize,
} from '@/lib/mapLabels'
import {
  straightLineMeters,
  type RouteTimeline,
} from '@/features/route-planning/lib/routeTimeline'
import { legKey, type RoadLegs } from '@/features/route-planning/lib/roadLegs'

const FIT_PADDING = { top: 96, right: 72, bottom: 32, left: 72 }

export type DroppedPin = { coordinate: Coordinate; title?: string }

const SAME_PIN_M = 75

export default function RouteMap({
  stops,
  timeline,
  roads,
  origin,
  originCoordinate,
  finish,
  finishCoordinate,
  selectedKey,
  onSelect,
  onAddPin,
  onStartAtPin,
  onFinishAtPin,
  canAdd,
  bottomInset = 0,
  style,
}: {
  stops: BuilderStop[]
  timeline: RouteTimeline

  roads: RoadLegs
  origin: RouteOrigin
  originCoordinate: Coordinate | null
  finish: RouteFinish

  finishCoordinate: Coordinate | null
  selectedKey: string | null
  onSelect: (key: string | null) => void
  onAddPin: (pin: DroppedPin) => void
  onStartAtPin: (pin: DroppedPin) => void
  onFinishAtPin: (pin: DroppedPin) => void

  canAdd: boolean

  bottomInset?: number
  style?: StyleProp<ViewStyle>
}) {
  const theme = useTheme()
  const colorScheme = usePreferences((s) => s.colorScheme)
  const mapRef = useRef<MapView>(null)
  const [ready, setReady] = useState(false)
  const [pin, setPin] = useState<DroppedPin | null>(null)
  const [region, setRegion] = useState<MapRegion | null>(null)
  const [size, setSize] = useState<MapSize | null>(null)

  const showsOrigin = origin.kind === 'place' && originCoordinate
  const finishAt = stops.length > 0 ? finishCoordinate : null

  const startPin = showsOrigin
    ? originCoordinate
    : origin.kind === 'firstStop'
      ? stops[0]?.coordinate
      : undefined

  const showsFinish =
    !!finishAt &&
    !(startPin && straightLineMeters(startPin, finishAt) < SAME_PIN_M)
  const roundTrip = !!finishAt && !showsFinish
  const path = [
    ...(originCoordinate ? [originCoordinate] : []),
    ...stops.map((stop) => stop.coordinate),
    ...(finishAt ? [finishAt] : []),
  ]

  const line = path.flatMap((to, index) => {
    if (index === 0) return [to]
    return roads.get(legKey(path[index - 1]!, to))?.coordinates ?? [to]
  })

  const lineKey = `${line.length}|${path
    .map((c) => `${c.latitude.toFixed(5)},${c.longitude.toFixed(5)}`)
    .join('|')}`
  const fitSignature = path
    .map((c) => `${c.latitude.toFixed(5)},${c.longitude.toFixed(5)}`)
    .sort()
    .join('|')

  const fit = (animated = true) => {
    const map = mapRef.current
    if (!map || path.length === 0) return
    if (path.length === 1) {
      map.animateToRegion(
        { ...path[0]!, latitudeDelta: 0.01, longitudeDelta: 0.01 },
        animated ? 225 : 0
      )
      return
    }
    map.fitToCoordinates(path, {
      edgePadding: { ...FIT_PADDING, bottom: FIT_PADDING.bottom + bottomInset },
      animated,
    })
  }

  const refit = useEffectEvent(() => fit(false))
  useEffect(() => {
    if (ready) refit()
  }, [ready, fitSignature])

  const showSelected = useEffectEvent((key: string | null) => {
    const stop = stops.find((s) => s.key === key)
    if (!stop) return
    mapRef.current?.animateCamera(
      { center: stop.coordinate },
      { duration: 250 }
    )
  })
  useEffect(() => {
    if (ready) showSelected(selectedKey)
  }, [selectedKey, ready])

  const dropPin = async (coordinate: Coordinate) => {
    setPin({ coordinate })
    onSelect(null)
    const title = await pinTitle(coordinate)
    if (!title) return
    setPin((current) =>
      current?.coordinate === coordinate ? { coordinate, title } : current
    )
  }

  const entryByKey = new Map(
    timeline.entries.map((entry) => [entry.key, entry])
  )
  const arrival = (key: string) =>
    formatStartTime(entryByKey.get(key)?.begin ?? timeline.start)

  const points = [
    ...(showsOrigin
      ? [
          {
            key: 'route-start',
            coordinate: originCoordinate,
            position: undefined,
            end: 'start' as const,

            time: roundTrip
              ? i18n.t('routeBuilder_timeRange', {
                  start: formatStartTime(timeline.start),
                  end: formatStartTime(timeline.end),
                })
              : i18n.t('routeBuilder_startAt', {
                  time: formatStartTime(timeline.start),
                }),
            title: origin.title,
            late: false,
            zIndex: stops.length + 1,
            accessibilityLabel: i18n.t(
              roundTrip
                ? 'routeBuilder_roundTripFrom'
                : 'routeBuilder_startFrom',
              { place: origin.title }
            ),
          },
        ]
      : []),
    ...stops.map((stop, index) => {
      const time = arrival(stop.key)
      return {
        key: stop.key,
        coordinate: stop.coordinate,
        position: index + 1,
        time,
        title: stop.title,
        late: !!entryByKey.get(stop.key)?.lateMinutes,
        zIndex: stops.length - index,
        accessibilityLabel: i18n.t('routeBuilder_stopA11y', {
          position: index + 1,
          name: stop.title,
          time,
        }),
      }
    }),
    ...(showsFinish && finishAt
      ? [
          {
            key: 'route-finish',
            coordinate: finishAt,
            position: undefined,
            end: 'finish' as const,
            time: i18n.t('routeBuilder_finishAtTime', {
              time: formatStartTime(timeline.end),
            }),
            title:
              finish.kind === 'place'
                ? finish.title
                : i18n.t('routeBuilder_backToStart'),
            late: false,
            zIndex: 0,
            accessibilityLabel: i18n.t('routeBuilder_finishAtTime', {
              time: formatStartTime(timeline.end),
            }),
          },
        ]
      : []),
  ]

  const candidates: LabelCandidate[] = points
    .map((point) => ({
      key: point.key,
      coordinate: point.coordinate,
      width: estimateCardWidth([point.time, point.title]),
    }))
    .sort(
      (a, b) => Number(b.key === selectedKey) - Number(a.key === selectedKey)
    )
  const placements =
    region && size
      ? placeLabels(candidates, region, size, {
          cardHeight: MARKER_CARD_HEIGHT,

          gap: MARKER_GAP + MARKER_POINTER,
          pin: MARKER_PIN,
        })
      : null

  return (
    <View style={[{ overflow: 'hidden' }, style]}>
      <MapView
        ref={mapRef}
        style={{ flex: 1 }}
        onLayout={(e) => {
          const { width, height } = e.nativeEvent.layout
          setSize({ width, height })
        }}
        onRegionChangeComplete={setRegion}
        userInterfaceStyle={colorScheme ?? undefined}
        showsUserLocation={origin.kind === 'currentLocation'}
        showsMyLocationButton={false}
        showsPointsOfInterests={false}
        toolbarEnabled={false}
        onMapReady={() => setReady(true)}
        onPress={() => {
          onSelect(null)
          setPin(null)
        }}
        onLongPress={(e) => void dropPin(e.nativeEvent.coordinate)}
      >
        {path.length > 1 && (
          <>
            <Polyline
              key={`casing|${lineKey}`}
              coordinates={line}
              strokeColor={theme.colors.card}
              strokeWidth={7}
              lineCap='round'
              lineJoin='round'
            />
            <Polyline
              key={`line|${lineKey}`}
              coordinates={line}
              strokeColor={theme.colors.accent}
              strokeWidth={4}
              lineCap='round'
              lineJoin='round'
            />
          </>
        )}
        {points.map((point) => (
          <RouteMapPin
            key={point.key}
            id={point.key}
            coordinate={point.coordinate}
            position={point.position}
            end={'end' in point ? point.end : undefined}
            selected={selectedKey === point.key}
            zIndex={point.zIndex}
            accessibilityLabel={point.accessibilityLabel}
            onPress={() => {
              setPin(null)
              onSelect(point.key)
            }}
          />
        ))}
        {points.map((point) => {
          const placement = placements?.get(point.key) ?? 'none'
          if (placement === 'none') return null
          return (
            <RouteMapCard
              key={`${point.key}|${placement}|${point.time}|${point.title}`}
              id={point.key}
              coordinate={point.coordinate}
              placement={placement}
              time={point.time}
              title={point.title}
              selected={selectedKey === point.key}
              late={point.late}
              zIndex={100 + point.zIndex}
              onPress={() => {
                setPin(null)
                onSelect(point.key)
              }}
            />
          )
        })}
        {pin && (
          <Marker
            identifier='route-dropped-pin'
            coordinate={pin.coordinate}
            pinColor={theme.colors.accent}
            stopPropagation
          />
        )}
      </MapView>

      {stops.length > 0 && (
        <RouteMapSpan
          start={timeline.start}
          end={timeline.end}
          style={{ position: 'absolute', top: 12, left: 12 }}
        />
      )}

      <View
        style={{
          position: 'absolute',
          right: 12,
          bottom: 12 + bottomInset,
        }}
      >
        <FloatingGlassButton
          icon={ScanIcon}
          label={i18n.t('routeBuilder_showAll')}
          onPress={() => fit()}
        />
      </View>

      {pin && (
        <DroppedPinCard
          pin={pin}
          canAdd={canAdd}
          style={{
            position: 'absolute',
            left: 12,
            right: 64,
            maxWidth: 420,
            bottom: 12 + bottomInset,
          }}
          onAdd={() => {
            onAddPin(pin)
            setPin(null)
          }}
          onStartHere={() => {
            onStartAtPin(pin)
            setPin(null)
          }}
          onFinishHere={() => {
            onFinishAtPin(pin)
            setPin(null)
          }}
          onDismiss={() => setPin(null)}
        />
      )}
    </View>
  )
}
