import { useEffect, useRef, useState } from 'react'
import { Platform, View } from 'react-native'
import MapView, { Marker, Polyline } from 'react-native-maps'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import {
  cancelAnimation,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated'
import { scheduleOnRN } from 'react-native-worklets'
import * as Location from 'expo-location'
import { Trash2 as TrashIcon, X as XIcon } from 'lucide-react-native'
import LocationNotice from '@/components/LocationNotice'
import Button from '@/components/ui/Button'
import { UndoIcon } from '@/components/ui/DirectionalIcon'
import { inputLayout } from '@/components/ui/inputs/InputLayout'
import LucideIcon, { type AppIcon } from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'
import Spinner from '@/components/ui/Spinner'
import useTheme from '@/contexts/theme'
import useLocationAccess from '@/hooks/useLocationAccess'
import Haptics from '@/lib/haptics'
import i18n from '@/lib/locales'
import { checkLocationAccess } from '@/lib/locationPermission'
import { usePreferences } from '@/stores/preferences'
import { TerritoryMapEditorFrame } from '@/features/territories/components/TerritoryMapEditor'
import TerritoryOutlineDragLayer, {
  type HeldCorner,
} from '@/features/territories/components/TerritoryOutlineDragLayer'
import TerritoryOutlineShape from '@/features/territories/components/TerritoryOutlineShape'
import {
  cornerAt,
  cornerPoint,
  draggedCorner,
  edgeAt,
  insertCorner,
  isOutline,
  MIN_OUTLINE_CORNERS,
  type MapRegion,
  type MapSize,
  regionFor,
  removeCorner,
  replaceCorner,
  type ScreenPoint,
  tappedAfterInsert,
  tappedAfterRemove,
} from '@/features/territories/lib/territoryArea'
import type { Coordinate } from '@/types/contact'

const INSET = 12
const CORNER = 14
const SELECTED = 26
const TARGET = 44
const GRAB = 32
const CLOSEST = 0.004
const HANDOFF_DELAY = 120
const HANDOFF_FADE = 120

const onScreen = (
  corners: readonly Coordinate[],
  { region, size }: { region: MapRegion | null; size: MapSize | null }
): ScreenPoint[] =>
  region && size
    ? corners.map((corner) => cornerPoint(corner, region, size))
    : []

const opening = async (points: Coordinate[]): Promise<MapRegion | null> => {
  const known = regionFor(points, CLOSEST)
  if (known) return known
  try {
    if ((await checkLocationAccess()) !== 'granted') return null
    const last = await Location.getLastKnownPositionAsync()
    return last
      ? {
          latitude: last.coords.latitude,
          longitude: last.coords.longitude,
          latitudeDelta: CLOSEST,
          longitudeDelta: CLOSEST,
        }
      : null
  } catch {
    return null
  }
}

export default function TerritoryOutlineEditor({
  outline,
  pin,
  onClose,
  onDone,
}: {
  outline: readonly Coordinate[]
  pin: Coordinate | undefined
  onClose: () => void
  onDone: (outline: Coordinate[]) => void
}) {
  const theme = useTheme()
  const colorScheme = usePreferences((state) => state.colorScheme)
  const [draft, setDraft] = useState<Coordinate[]>(() => [...outline])
  const [selected, setSelected] = useState<number | null>(null)
  const [tapped, setTapped] = useState<number[]>([])
  const [region, setRegion] = useState<MapRegion | null | undefined>()
  const location = useLocationAccess()
  const [noticeHidden, setNoticeHidden] = useState(false)
  const [start] = useState(() => [...outline, ...(pin ? [pin] : [])])
  const mapRef = useRef<MapView>(null)
  const view = useRef<{ region: MapRegion | null; size: MapSize | null }>({
    region: null,
    size: null,
  })
  const [dragging, setDragging] = useState(false)
  const points = useSharedValue<ScreenPoint[]>([])
  const held = useSharedValue<HeldCorner | null>(null)
  const moved = useSharedValue<ScreenPoint>({ x: 0, y: 0 })
  const active = useSharedValue(false)
  const grabbed = useSharedValue(false)
  const shown = useSharedValue(0)

  const placeCorners = (corners: readonly Coordinate[]) => {
    points.value = onScreen(corners, view.current)
  }

  useEffect(() => {
    points.value = onScreen(draft, view.current)
  }, [draft, points])

  useEffect(() => {
    void opening(start).then((found) => {
      view.current.region = found
      setRegion(found)
    })
  }, [start])

  const count = draft.length
  const corner = selected === null ? undefined : draft[selected]

  const measureRegion = async () => {
    const bounds = await mapRef.current?.getMapBoundaries().catch(() => null)
    if (!bounds) return
    const { northEast, southWest } = bounds
    view.current.region = {
      latitude: (northEast.latitude + southWest.latitude) / 2,
      longitude: (northEast.longitude + southWest.longitude) / 2,
      latitudeDelta: northEast.latitude - southWest.latitude,
      longitudeDelta: northEast.longitude - southWest.longitude,
    }
    placeCorners(draft)
  }

  const add = (index: number, point: Coordinate) => {
    setDraft(insertCorner(draft, index, point))
    setTapped(tappedAfterInsert(tapped, index))
  }

  const remove = (index: number) => {
    setDraft(removeCorner(draft, index))
    setTapped(tappedAfterRemove(tapped, index))
    if (selected === index) setSelected(null)
    else if (selected !== null && selected > index) setSelected(selected - 1)
  }

  const select = (index: number) => {
    if (index === selected) return
    Haptics.light()
    setSelected(index)
  }

  const drop = (index: number, translation: ScreenPoint) => {
    const { region: at, size } = view.current
    if (at && size && (translation.x !== 0 || translation.y !== 0))
      setDraft((current) => {
        const from = current[index]
        return from
          ? replaceCorner(
              current,
              index,
              draggedCorner(from, translation, at, size)
            )
          : current
      })
    setDragging(false)
    shown.value = withDelay(
      HANDOFF_DELAY,
      withTiming(0, { duration: HANDOFF_FADE })
    )
  }

  const pan = Gesture.Pan()
    .enabled(corner !== undefined)
    .manualActivation(true)
    .onTouchesDown((event, manager) => {
      const touch = event.allTouches[0]
      const at = selected === null ? undefined : points.value[selected]
      grabbed.value = false
      if (!touch || !at || event.numberOfTouches > 1) return manager.fail()
      if (Math.hypot(at.x - touch.x, at.y - touch.y) > GRAB)
        return manager.fail()
      grabbed.value = true
    })
    .onTouchesMove((_event, manager) => {
      if (grabbed.value) manager.activate()
    })
    .onUpdate((event) => {
      const at = selected === null ? undefined : points.value[selected]
      if (selected === null || !at) return
      if (!active.value) {
        active.value = true
        scheduleOnRN(setDragging, true)
      }
      cancelAnimation(shown)
      shown.value = 1
      moved.value = { x: event.translationX, y: event.translationY }
      held.value = {
        index: selected,
        x: at.x + event.translationX,
        y: at.y + event.translationY,
      }
    })
    .onFinalize(() => {
      const drag = held.value
      if (!active.value || !drag) return
      active.value = false
      scheduleOnRN(drop, drag.index, moved.value)
    })

  const status =
    corner !== undefined
      ? i18n.t('territories.map.cornerSelected')
      : count === 0
        ? i18n.t('territories.map.outlineHint')
        : count < MIN_OUTLINE_CORNERS
          ? i18n.t('territories.map.outlineNeedMore')
          : i18n.t('territories.map.outlineEditHint', { count })

  const action = (
    icon: AppIcon,
    label: string,
    onPress: () => void,
    testID: string,
    enabled: boolean,
    color = theme.colors.text
  ) => (
    <Button
      variant='outline'
      disabled={!enabled}
      onPress={onPress}
      testID={testID}
      style={{
        flexGrow: 1,
        flexBasis: 'auto',
        minHeight: 44,
        paddingVertical: 10,
        paddingHorizontal: 14,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        borderRadius: 22,
        opacity: enabled ? 1 : 0.5,
      }}
    >
      <LucideIcon icon={icon} size={16} color={color} />
      <Text style={{ fontFamily: theme.fonts.semiBold, color }}>{label}</Text>
    </Button>
  )

  return (
    <TerritoryMapEditorFrame
      title={i18n.t('territories.map.outline')}
      onClose={onClose}
      onDone={() => onDone(draft)}
      testID='territory-outline-editor'
    >
      <View style={{ flex: 1, padding: INSET, gap: 12 }}>
        <GestureDetector gesture={pan}>
          <View
            onLayout={(event) => {
              const { width, height } = event.nativeEvent.layout
              view.current.size = { width, height }
              placeCorners(draft)
            }}
            style={{
              flex: 1,
              minHeight: 240,
              borderRadius: inputLayout.sectionRadius - INSET,
              borderCurve: 'continuous',
              overflow: 'hidden',
              backgroundColor: theme.colors.backgroundLighter,
            }}
          >
            {region === undefined ? (
              <View
                style={{
                  flex: 1,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Spinner />
              </View>
            ) : (
              <MapView
                ref={mapRef}
                testID='territory-outline-map'
                userInterfaceStyle={colorScheme ? colorScheme : undefined}
                style={{ flex: 1 }}
                initialRegion={region ?? undefined}
                showsUserLocation={location.granted}
                showsPointsOfInterests={false}
                toolbarEnabled={false}
                rotateEnabled={false}
                pitchEnabled={false}
                scrollEnabled={Platform.select({
                  web: true,
                  default: corner === undefined,
                })}
                zoomEnabled={!dragging}
                onMapReady={() => void measureRegion()}
                onRegionChange={(next) => {
                  view.current.region = next
                  placeCorners(draft)
                }}
                onRegionChangeComplete={(next) => {
                  view.current.region = next
                  placeCorners(draft)
                }}
                onPress={(event) => {
                  const { action, coordinate, position } = event.nativeEvent
                  if (action === 'marker-press') return
                  const { region: shown, size } = view.current
                  const measured = shown && size && position
                  const near = measured
                    ? cornerAt(position, draft, shown, size, TARGET / 2)
                    : undefined
                  if (near !== undefined) return select(near)
                  if (selected !== null) return setSelected(null)
                  const edge = measured
                    ? edgeAt(position, draft, shown, size, TARGET / 2)
                    : undefined
                  const { latitude, longitude } = coordinate
                  add(edge ?? count, { latitude, longitude })
                }}
              >
                {dragging ? null : isOutline(draft) ? (
                  <TerritoryOutlineShape
                    outline={draft}
                    color={theme.colors.accent}
                  />
                ) : (
                  count === 2 && (
                    <Polyline
                      coordinates={draft}
                      strokeColor={theme.colors.accent}
                      strokeWidth={3}
                    />
                  )
                )}
                {draft.map((point, index) => {
                  const chosen = index === selected
                  return (
                    <Marker
                      key={`corner-${index}-${chosen}`}
                      identifier={`territory-corner-${index}`}
                      testID={`territory-corner-${index}`}
                      coordinate={point}
                      anchor={{ x: 0.5, y: 0.5 }}
                      zIndex={chosen ? 2 : 1}
                      opacity={chosen && dragging ? 0 : 1}
                      tracksViewChanges={false}
                      onPress={() => select(index)}
                    >
                      <View
                        style={{
                          width: chosen ? SELECTED : CORNER,
                          height: chosen ? SELECTED : CORNER,
                          borderRadius: (chosen ? SELECTED : CORNER) / 2,
                          borderWidth: chosen ? 6 : 2,
                          borderColor: chosen
                            ? theme.colors.accent
                            : theme.colors.card,
                          backgroundColor: chosen
                            ? theme.colors.card
                            : theme.colors.accent,
                        }}
                      />
                    </Marker>
                  )
                })}
              </MapView>
            )}
            <TerritoryOutlineDragLayer
              points={points}
              held={held}
              shown={shown}
              color={theme.colors.accent}
              ring={theme.colors.card}
            />
          </View>
        </GestureDetector>
        {location.notice && !noticeHidden && location.access && (
          <LocationNotice
            access={location.access}
            fix={location.fix}
            onFix={location.runFix}
            onDismiss={() => setNoticeHidden(true)}
            testID='territory-outline-location-notice'
            style={{ paddingStart: 4, marginVertical: -6 }}
          />
        )}
        <Text
          testID='territory-outline-status'
          accessibilityLiveRegion='polite'
          numberOfLines={2}
          style={{
            color: theme.colors.textAlt,
            paddingHorizontal: 4,
            minHeight: 40,
          }}
        >
          {status}
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
          {action(
            UndoIcon,
            i18n.t('territories.map.undoCorner'),
            () => remove(tapped.at(-1) ?? count - 1),
            'territory-outline-undo',
            count > 0
          )}
          {action(
            XIcon,
            i18n.t('territories.map.deleteCorner'),
            () => {
              if (selected !== null) remove(selected)
            },
            'territory-outline-delete-corner',
            corner !== undefined
          )}
          {action(
            TrashIcon,
            i18n.t('territories.map.clearOutline'),
            () => {
              setDraft([])
              setTapped([])
              setSelected(null)
            },
            'territory-outline-clear',
            count > 0,
            theme.colors.error
          )}
        </View>
      </View>
    </TerritoryMapEditorFrame>
  )
}
