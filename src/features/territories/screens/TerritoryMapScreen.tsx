import { useEffect, useRef, useState } from 'react'
import { StyleSheet, View } from 'react-native'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import MapView, { Marker } from 'react-native-maps'
import * as Location from 'expo-location'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Link as LinkIcon } from 'lucide-react-native'
import Button from '@/components/ui/Button'
import FoldPane from '@/components/ui/layout/FoldPane'
import Header from '@/components/ui/layout/Header'
import Text from '@/components/ui/MyText'
import SegmentedControl from '@/components/ui/SegmentedControl'
import useTheme from '@/contexts/theme'
import { openURL } from '@/lib/links'
import i18n from '@/lib/locales'
import { usePreferences } from '@/stores/preferences'
import { toast } from '@/stores/toasts'
import TerritoryHeaderAction from '@/features/territories/components/TerritoryHeaderAction'
import TerritoryCardPhotoViewer from '@/features/territories/components/TerritoryCardPhotoViewer'
import TerritoryMapControls from '@/features/territories/components/TerritoryMapControls'
import TerritoryMapMarker from '@/features/territories/components/TerritoryMapMarker'
import TerritoryMarkerCard from '@/features/territories/components/TerritoryMarkerCard'
import TerritoryOutlineShape from '@/features/territories/components/TerritoryOutlineShape'
import useDoorRecordPrivacy from '@/features/territories/hooks/useDoorRecordPrivacy'
import { doorLocationAllowed } from '@/features/territories/lib/doorLocation'
import { isOutline, regionFor } from '@/features/territories/lib/territoryArea'
import {
  fitPoints,
  hasMapView,
  markerSpacing,
  metresPerPoint,
  openingView,
  showsMarkerDots,
  streetFocus,
  territoryMapMarkers,
  type TerritoryMapView,
} from '@/features/territories/lib/territoryMap'
import {
  formatDoorAddress,
  territoryTitle,
} from '@/features/territories/lib/territoryTitle'
import { useTerritory } from '@/features/territories/stores/territories'
import type { Coordinate } from '@/types/contact'
import type { RootStackParamList } from '@/types/rootStack'

type Props = NativeStackScreenProps<RootStackParamList, 'TerritoryMap'>

const CLOSEST = 0.0025
const CONTROLS_TOP = 12
const CARD_ROOM = 240

export default function TerritoryMapScreen({ route, navigation }: Props) {
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  const colorScheme = usePreferences((state) => state.colorScheme)
  const { territoryId } = route.params
  const territory = useTerritory(territoryId)
  const privacy = useDoorRecordPrivacy()
  const mapRef = useRef<MapView>(null)
  const markers = territory
    ? territoryMapMarkers(territory, {
        privacy,
        formatAddress: formatDoorAddress,
      })
    : []
  const [view, setView] = useState<TerritoryMapView>(() =>
    territory ? openingView(territory, markers, route.params.view) : 'map'
  )
  const [focus, setFocus] = useState(() =>
    streetFocus(markers, route.params.streetId)
  )
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [locationAllowed, setLocationAllowed] = useState(false)
  const [cardHeight, setCardHeight] = useState(0)
  const [mapHeight, setMapHeight] = useState(0)
  const [latitudeDelta, setLatitudeDelta] = useState<number | null>(null)

  useEffect(() => {
    if (!territory) navigation.goBack()
  }, [territory, navigation])

  useEffect(() => {
    void doorLocationAllowed().then(setLocationAllowed)
  }, [])

  if (!territory) return null

  const mapAvailable = hasMapView(territory, markers)
  const shown: TerritoryMapView =
    view === 'card' && territory.photo ? 'card' : 'map'
  const outline = isOutline(territory.outline) ? territory.outline : null
  const focusStreet = territory.streets.find((street) => street.id === focus)
  const focused = !!focusStreet
  const selected = markers.find((marker) => marker.id === selectedId)
  const selectedStreet = territory.streets.find(
    (street) => street.id === selected?.streetId
  )
  const fit = (streetId: string | undefined, animated = true) => {
    const points = fitPoints(territory, markers, streetId)
    if (points.length === 0) return
    if (points.length === 1) {
      const region = regionFor(points, CLOSEST)
      if (region) mapRef.current?.animateToRegion(region, animated ? 400 : 0)
      return
    }
    mapRef.current?.fitToCoordinates(points, {
      edgePadding: {
        top: 60,
        right: 76,
        bottom: selected ? CARD_ROOM : 60,
        left: 40,
      },
      animated,
    })
  }

  const goTo = (coordinate: Coordinate) =>
    mapRef.current?.animateToRegion(
      { ...coordinate, latitudeDelta: CLOSEST, longitudeDelta: CLOSEST },
      400
    )

  const onLocation = async () => {
    try {
      if (!locationAllowed) {
        const { granted } = await Location.requestForegroundPermissionsAsync()
        setLocationAllowed(granted)
        if (!granted) toast.info(i18n.t('territories.map.locationOff'))
        return
      }
      const position =
        (await Location.getLastKnownPositionAsync()) ??
        (await Location.getCurrentPositionAsync())
      goTo({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      })
    } catch {
      toast.info(i18n.t('territories.map.locationOff'))
    }
  }

  const initialRegion = regionFor(fitPoints(territory, markers, focus), CLOSEST)
  const dots = showsMarkerDots(
    markerSpacing(markers.map((marker) => marker.coordinate)),
    metresPerPoint(
      latitudeDelta ?? initialRegion?.latitudeDelta ?? CLOSEST,
      mapHeight
    )
  )

  const map = (
    <View
      style={{ flex: 1 }}
      onLayout={(event) =>
        setMapHeight(Math.round(event.nativeEvent.layout.height))
      }
    >
      <MapView
        ref={mapRef}
        testID='territory-map'
        accessibilityLabel={i18n.t(
          markers.length > 0
            ? 'territories.mapPins_description'
            : 'territories.mapPin_description'
        )}
        userInterfaceStyle={colorScheme ? colorScheme : undefined}
        style={StyleSheet.absoluteFill}
        initialRegion={initialRegion}
        showsUserLocation={locationAllowed}
        showsMyLocationButton={false}
        showsPointsOfInterests={false}
        toolbarEnabled={false}
        mapPadding={{
          top: 0,
          right: 0,
          left: 0,
          bottom: selected ? cardHeight : 0,
        }}
        onMapReady={() => fit(focus, false)}
        onRegionChangeComplete={(region) =>
          setLatitudeDelta(region.latitudeDelta)
        }
        onPress={(event) => {
          if (event.nativeEvent.action === 'marker-press') return
          setSelectedId(null)
        }}
      >
        {outline && (
          <TerritoryOutlineShape
            outline={outline}
            color={theme.colors.accent}
          />
        )}
        {!outline && territory.coordinate && (
          <Marker
            identifier='territory-pin'
            coordinate={territory.coordinate}
            pinColor={theme.colors.accent}
            zIndex={0}
          />
        )}
        {markers.map((marker) => (
          <TerritoryMapMarker
            key={marker.id}
            marker={marker}
            selected={marker.id === selectedId}
            dimmed={focused && marker.streetId !== focus}
            dot={dots}
            onPress={() => setSelectedId(marker.id)}
          />
        ))}
      </MapView>

      {focusStreet && (
        <View
          pointerEvents='box-none'
          style={{
            position: 'absolute',
            top: CONTROLS_TOP,
            left: 16,
            right: 76,
            alignItems: 'flex-start',
            gap: 8,
          }}
        >
          <View
            testID='territory-map-focus-street'
            style={{
              minHeight: 44,
              maxWidth: '100%',
              justifyContent: 'center',
              paddingHorizontal: 16,
              borderRadius: 22,
              borderCurve: 'continuous',
              backgroundColor: `${theme.colors.card}EE`,
            }}
          >
            <Text
              numberOfLines={1}
              style={{ fontFamily: theme.fonts.semiBold }}
            >
              {focusStreet.name}
            </Text>
          </View>
          <Button
            variant='glass'
            onPress={() => {
              setFocus(undefined)
              fit(undefined)
            }}
            testID='territory-map-focus'
            style={{
              minHeight: 44,
              justifyContent: 'center',
              paddingHorizontal: 16,
              borderRadius: 22,
              backgroundColor: `${theme.colors.card}EE`,
            }}
          >
            <Text
              style={{
                fontFamily: theme.fonts.semiBold,
                color: theme.colors.accent,
              }}
            >
              {i18n.t('territories.map.streetFocus_clear')}
            </Text>
          </Button>
        </View>
      )}

      <TerritoryMapControls
        top={CONTROLS_TOP}
        locationAllowed={locationAllowed}
        onLocation={() => void onLocation()}
      />

      {selected && (
        <FoldPane
          style={StyleSheet.absoluteFill}
          contentStyle={{ justifyContent: 'flex-end' }}
        >
          <View
            onLayout={(event) =>
              setCardHeight(Math.round(event.nativeEvent.layout.height))
            }
            style={{
              padding: 12,
              paddingBottom: insets.bottom + 12,
              width: '100%',
              maxWidth: 520,
              alignSelf: 'center',
            }}
          >
            <TerritoryMarkerCard
              marker={selected}
              streetName={selectedStreet?.name}
              onClose={() => setSelectedId(null)}
              onOpenStreet={
                selectedStreet
                  ? () =>
                      navigation.navigate('TerritoryStreet', {
                        territoryId,
                        streetId: selectedStreet.id,
                      })
                  : null
              }
            />
          </View>
        </FoldPane>
      )}
    </View>
  )

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <Header
        buttonType='back'
        title={territoryTitle(territory)}
        rightElement={
          territory.link ? (
            <TerritoryHeaderAction
              icon={LinkIcon}
              label={i18n.t('territories.openLink')}
              onPress={() => territory.link && void openURL(territory.link)}
              testID='territory-map-open-link'
            />
          ) : undefined
        }
      />
      {territory.photo && mapAvailable && (
        <View style={{ paddingHorizontal: 16, paddingBottom: 10 }}>
          <SegmentedControl<TerritoryMapView>
            testID='territory-map-view'
            options={[
              {
                key: 'map',
                label: i18n.t('territories.map.viewMap'),
                testID: 'territory-map-view-map',
              },
              {
                key: 'card',
                label: i18n.t('territories.map.viewCard'),
                testID: 'territory-map-view-card',
              },
            ]}
            value={shown}
            onChange={(next) => {
              setSelectedId(null)
              setView(next)
            }}
          />
        </View>
      )}
      {shown === 'card' && territory.photo ? (
        <TerritoryCardPhotoViewer
          photo={territory.photo}
          inset={{ top: 0, bottom: insets.bottom }}
        />
      ) : (
        map
      )}
    </View>
  )
}
