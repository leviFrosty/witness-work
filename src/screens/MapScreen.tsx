import Wrapper from '../components/layout/Wrapper'
import MapView, { LatLng, Marker, PROVIDER_GOOGLE } from 'react-native-maps'
import useContacts from '../stores/contactsStore'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigation } from '@react-navigation/native'
import { HomeTabStackNavigation } from '../stacks/HomeTabStack'
import useTheme from '../contexts/theme'
import useConversations from '../stores/conversationStore'
import moment from 'moment'
import { Alert, Dimensions, Platform, ScrollView, View } from 'react-native'
import Carousel, { ICarouselInstance } from 'react-native-reanimated-carousel'
import MapCarouselCard from '../components/MapCarouselCard'
import { Contact } from '../types/contact'
import * as Location from 'expo-location'
import * as Crypto from 'expo-crypto'
import ShareAddressSheet, {
  MapShareSheet,
} from '../components/ShareAddressSheet'
import { usePreferences } from '../stores/preferences'
import Text from '../components/MyText'
import Button from '../components/Button'
import i18n from '../lib/locales'
import { countTruthyValueStrings } from '../lib/objects'
import ActionButton from '../components/ActionButton'
import {
  fetchCoordinateFromAddress,
  requestLocationPermission,
} from '../lib/address'
import Loader from '../components/Loader'
import { Progress } from 'tamagui'
import AnimatedLottieView from 'lottie-react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Card from '../components/Card'
import Circle from '../components/Circle'
import { RootStackNavigation } from '../stacks/RootStack'
import IconButton from '../components/IconButton'
import { faPlus } from '@fortawesome/free-solid-svg-icons'
import useDevice from '../hooks/useDevice'

export interface ContactMarker extends Contact {
  pinColor: string
}

interface FullMapViewProps {
  contactMarkers: ContactMarker[]
}

const FullMapView = ({ contactMarkers }: FullMapViewProps) => {
  const navigation = useNavigation<HomeTabStackNavigation>()
  const width = Dimensions.get('window').width
  const { isAndroid } = useDevice()
  const mapRef = useRef<MapView>(null)
  const insets = useSafeAreaInsets()
  const carouselRef = useRef<ICarouselInstance>(null)
  const [locationPermission, setLocationPermission] = useState(false)
  const [sheet, setSheet] = useState<MapShareSheet>({
    open: false,
    appleMapsUri: '',
    googleMapsUri: '',
  })
  const theme = useTheme()
  const { contacts, updateContact } = useContacts()

  const handleDragContactPin = (id: string, coordinate: LatLng) => {
    updateContact({
      ...contacts.find((c) => c.id === id),
      coordinate,
      userDraggedCoordinate: true,
    })
  }

  const fitToMarkers = useCallback(() => {
    mapRef.current?.fitToSuppliedMarkers(contactMarkers.map((c) => c.id))
  }, [contactMarkers])

  const handleMapLayout = () => {
    fitToMarkers()
  }

  const handleFitToMarker = (index: number) => {
    if (contactMarkers[index]) {
      mapRef.current?.fitToSuppliedMarkers([contactMarkers[index].id])
    }
  }

  useEffect(() => {
    const unsubscribe = navigation.addListener('tabPress', (e) => {
      if (e.target?.includes('Map')) {
        fitToMarkers()
      }
    })
    return unsubscribe
  }, [fitToMarkers, navigation])

  useEffect(() => {
    fitToMarkers()

    // Only run at mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const getLocation = async () => {
      const { granted } = await Location.getForegroundPermissionsAsync()
      if (granted) {
        setLocationPermission(true)
      }
    }

    getLocation()
  }, [])

  const cardHeight = 280

  return (
    <>
      <MapView
        showsUserLocation={locationPermission}
        ref={mapRef}
        onLayout={handleMapLayout}
        style={{ height: '100%', width: '100%' }}
        provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
      >
        {contactMarkers.map((c, index) => (
          <Marker
            onPress={() =>
              carouselRef.current?.scrollTo({ index, animated: true })
            }
            identifier={c.id}
            key={c.id}
            coordinate={c.coordinate!}
            pinColor={c.pinColor}
            draggable
            onDragEnd={(e) =>
              handleDragContactPin(c.id, e.nativeEvent.coordinate)
            }
          />
        ))}
      </MapView>

      <View
        style={{
          position: 'absolute',
          bottom: 0,
          zIndex: 1000,
          paddingBottom: 15,
        }}
      >
        {contactMarkers.length === 0 ? (
          <View
            style={{
              height: 200,
              width: width,
              marginBottom: 100,
              padding: 10,
            }}
          >
            <Card>
              <Text
                style={{
                  fontSize: theme.fontSize('xl'),
                  fontFamily: theme.fonts.semiBold,
                }}
              >
                {i18n.t('noContactsToDisplay')}
              </Text>
              <Text>{i18n.t('map_noContactsWithGeocodes')}</Text>
              <ActionButton
                onPress={() =>
                  (navigation as unknown as RootStackNavigation).navigate(
                    'Contact Form',
                    {
                      id: Crypto.randomUUID(),
                    }
                  )
                }
              >
                {i18n.t('addContact')}
              </ActionButton>
            </Card>
          </View>
        ) : (
          <Carousel
            onSnapToItem={(index) => handleFitToMarker(index)}
            defaultIndex={0}
            ref={carouselRef}
            data={contactMarkers}
            renderItem={({ item }) => (
              <MapCarouselCard contact={item} setSheet={setSheet} />
            )}
            scrollAnimationDuration={100}
            mode='parallax'
            modeConfig={{
              parallaxScrollingScale: 0.9,
              parallaxScrollingOffset: 50,
            }}
            loop
            width={width}
            height={cardHeight}
          />
        )}
      </View>
      <ShareAddressSheet sheet={sheet} setSheet={setSheet} />
      {contactMarkers.length > 1 && (
        <View style={{ position: 'absolute', top: insets.top, left: 5 }}>
          <Button
            variant='solid'
            onPress={fitToMarkers}
            style={{ paddingVertical: 10, paddingHorizontal: 25 }}
          >
            <Text style={{ fontFamily: theme.fonts.bold }}>
              {i18n.t('fit')}
            </Text>
          </Button>
        </View>
      )}

      {!isAndroid && (
        <View style={{ position: 'absolute', top: insets.top, right: 5 }}>
          <Button
            variant='solid'
            style={{ paddingVertical: 10, paddingHorizontal: 25 }}
          >
            <IconButton
              icon={faPlus}
              color={theme.colors.text}
              onPress={() =>
                (navigation as unknown as RootStackNavigation).navigate(
                  'Contact Form',
                  { id: Crypto.randomUUID() }
                )
              }
            />
          </Button>
        </View>
      )}
    </>
  )
}

const MapOnboarding = () => {
  const { incrementGeocodeApiCallCount, set } = usePreferences()
  const { contacts, updateContact } = useContacts()
  const theme = useTheme()
  const navigation = useNavigation<HomeTabStackNavigation>()
  const abortController = useRef<AbortController>()
  const insets = useSafeAreaInsets()
  const [fetching, setFetching] = useState<boolean>()
  const [progress, setProgress] = useState(0)
  const [locationPermissions, setLocationPermissions] = useState<boolean>()

  const handleLocationPermission = (status: boolean) => {
    setLocationPermissions(status)
    goNext()
  }

  const oldContactsWithAddressWithoutCoordinates = useMemo(() => {
    return contacts.filter(
      (c) =>
        c.address && countTruthyValueStrings(c.address) !== 0 && !c.coordinate
    )
  }, [contacts])

  const [step, setStep] = useState(
    oldContactsWithAddressWithoutCoordinates.length === 0 ? 1 : 0
  )

  const updateOldContacts = useCallback(
    async (oldContacts: Contact[]) => {
      setFetching(true)

      try {
        oldContacts.forEach(async (contact, index) => {
          const position = await fetchCoordinateFromAddress(
            incrementGeocodeApiCallCount,
            contact.address,
            abortController.current
          )
          if (position) {
            const contactWithPosition: Contact = {
              ...contact,
              coordinate: position,
            }
            updateContact(contactWithPosition)
          }

          const progress = ((index + 1) / oldContacts.length) * 100
          setProgress(Math.round(progress))
        })
      } catch (error) {
        Alert.alert(
          i18n.t('somethingWentWrong'),
          i18n.t('weDidOurBestToUpdateAllOfYourContacts')
        )
      }

      setFetching(false)
      abortController.current?.abort()
    },
    [incrementGeocodeApiCallCount, updateContact]
  )

  useEffect(() => {
    // Cancels coordinate fetch request if user navigates away
    const unsubscribe = navigation.addListener('blur', () => {
      abortController.current?.abort()
      setFetching(false)
    })

    return unsubscribe
  }, [navigation])

  const goNext = () => {
    setStep(step + 1)
  }

  const hasTriedToUpdate = fetching === false

  return (
    <Wrapper
      insets='none'
      style={{
        flexGrow: 1,
        paddingHorizontal: 20,
        paddingTop: insets.top + 60,
        paddingBottom: insets.bottom + 80,
      }}
    >
      {step === 0 && (
        <View
          style={{
            flexGrow: 1,
            justifyContent: 'space-between',
          }}
        >
          <View style={{ gap: 15 }}>
            {oldContactsWithAddressWithoutCoordinates.length !== 0 && (
              <>
                <View
                  style={{ flexDirection: 'row', gap: 5, alignItems: 'center' }}
                >
                  <Text
                    style={{
                      fontSize: theme.fontSize('xl'),
                      fontFamily: theme.fonts.bold,
                    }}
                  >
                    {i18n.t('updateContacts')}
                  </Text>
                </View>
                <Text>
                  {i18n.t('mapViewOnboarding1')}{' '}
                  {oldContactsWithAddressWithoutCoordinates.length}{' '}
                  {i18n.t(
                    oldContactsWithAddressWithoutCoordinates.length === 1
                      ? 'mapViewOnboarding2'
                      : 'mapViewOnboarding2_plural'
                  )}
                </Text>
              </>
            )}
          </View>

          {fetching && (
            <View style={{ alignItems: 'center', justifyContent: 'center' }}>
              <Loader style={{ height: 120, width: 120 }} />
              <Progress value={progress}>
                <Progress.Indicator
                  animation='bouncy'
                  style={{ backgroundColor: theme.colors.accent }}
                />
              </Progress>
            </View>
          )}

          {oldContactsWithAddressWithoutCoordinates.length === 0 && (
            <View style={{ justifyContent: 'center', alignItems: 'center' }}>
              <AnimatedLottieView
                autoPlay={true}
                loop={false}
                style={{
                  width: 160,
                  height: 160,
                }}
                source={require('./../assets/lottie/checkMark.json')}
              />
              <Text
                style={{
                  textAlign: 'center',
                  fontSize: theme.fontSize('lg'),
                  fontFamily: theme.fonts.semiBold,
                }}
              >
                {i18n.t('allContactsUpdated')}
              </Text>
            </View>
          )}
          <View style={{ gap: 10 }}>
            {oldContactsWithAddressWithoutCoordinates.length !== 0 &&
              !hasTriedToUpdate && (
                <ActionButton
                  disabled={fetching}
                  onPress={() =>
                    updateOldContacts(oldContactsWithAddressWithoutCoordinates)
                  }
                >
                  <Text style={{ color: theme.colors.textInverse }}>
                    {i18n.t('updateAutomatically')}
                  </Text>
                </ActionButton>
              )}
            {(oldContactsWithAddressWithoutCoordinates.length === 0 ||
              hasTriedToUpdate) && (
              <ActionButton onPress={goNext}>
                <Text style={{ color: theme.colors.textInverse }}>
                  {i18n.t('continue')}
                </Text>
              </ActionButton>
            )}
            {oldContactsWithAddressWithoutCoordinates.length !== 0 && (
              <Button onPress={goNext}>
                <Text
                  style={{
                    textAlign: 'center',
                    color: theme.colors.textAlt,
                    fontSize: theme.fontSize('sm'),
                  }}
                >
                  {i18n.t('skip')}
                </Text>
              </Button>
            )}
          </View>
        </View>
      )}
      {step === 1 && (
        <View style={{ flexGrow: 1, justifyContent: 'space-between' }}>
          <View style={{ gap: 10 }}>
            <Text
              style={{
                fontSize: theme.fontSize('xl'),
                fontFamily: theme.fonts.bold,
              }}
            >
              {i18n.t('jwTimeWillShowYouYourLocation')}
            </Text>
            <Text>{i18n.t('thisMayHelpYouLocateWhereYouAre')}</Text>
          </View>
          <View style={{ gap: 10 }}>
            <View style={{ gap: 5 }}>
              <Text
                style={{
                  color: theme.colors.textAlt,
                  fontSize: theme.fontSize('sm'),
                }}
              >
                {i18n.t('yourLocationIsNeverSharedToExternalServices')}
              </Text>
              {locationPermissions === undefined ? (
                <ActionButton
                  onPress={() =>
                    requestLocationPermission(handleLocationPermission)
                  }
                >
                  <Text style={{ color: theme.colors.textInverse }}>
                    {i18n.t('enableLocationServices')}
                  </Text>
                </ActionButton>
              ) : (
                <ActionButton onPress={goNext}>
                  <Text style={{ color: theme.colors.textInverse }}>
                    {i18n.t('continue')}
                  </Text>
                </ActionButton>
              )}
            </View>
            <Button onPress={goNext}>
              <Text
                style={{
                  textAlign: 'center',
                  color: theme.colors.textAlt,
                  fontSize: theme.fontSize('sm'),
                }}
              >
                {i18n.t('skip')}
              </Text>
            </Button>
          </View>
        </View>
      )}
      {step === 2 && (
        <ScrollView
          contentContainerStyle={{
            flexGrow: 1,
            justifyContent: 'space-between',
            gap: 20,
          }}
        >
          <View style={{ gap: 20 }}>
            <View style={{ gap: 10 }}>
              <Text
                style={{
                  fontSize: theme.fontSize('xl'),
                  fontFamily: theme.fonts.bold,
                }}
              >
                {i18n.t('oneMoreThing')}
              </Text>
              <Text>{i18n.t('markers_description')}</Text>
            </View>
            <Card style={{ gap: 25 }}>
              <View style={{ gap: 5 }}>
                <Text
                  style={{
                    fontSize: theme.fontSize('lg'),
                    fontFamily: theme.fonts.semiBold,
                  }}
                >
                  {i18n.t('colorKey')}
                </Text>
                <Text style={{ color: theme.colors.textAlt }}>
                  {i18n.t('pinsAreBasedOnYourMostRecentConversation')}
                </Text>
              </View>
              <View
                style={{ flexDirection: 'row', gap: 15, alignItems: 'center' }}
              >
                <Circle size={30} color={theme.colors.textAlt} />
                <Text>{i18n.t('noConversations')}</Text>
              </View>
              <View
                style={{ flexDirection: 'row', gap: 15, alignItems: 'center' }}
              >
                <Circle size={30} color={theme.colors.error} />
                <Text>{i18n.t('longerThanAMonthAgo')}</Text>
              </View>
              <View
                style={{ flexDirection: 'row', gap: 15, alignItems: 'center' }}
              >
                <Circle size={30} color={theme.colors.warn} />
                <Text>{i18n.t('longerThanAWeekAgo')}</Text>
              </View>
              <View
                style={{ flexDirection: 'row', gap: 15, alignItems: 'center' }}
              >
                <Circle size={30} color={theme.colors.accent} />
                <Text>{i18n.t('withinThePastWeek')}</Text>
              </View>
            </Card>
          </View>

          <View>
            <ActionButton
              onPress={() => set({ hasCompletedMapOnboarding: true })}
            >
              <Text style={{ color: theme.colors.textInverse }}>
                {i18n.t('letsGo')}
              </Text>
            </ActionButton>
          </View>
        </ScrollView>
      )}
    </Wrapper>
  )
}

const MapScreen = () => {
  const { contacts } = useContacts()
  const { conversations } = useConversations()
  const theme = useTheme()
  const { hasCompletedMapOnboarding } = usePreferences()

  const contactMarkers: ContactMarker[] = useMemo(() => {
    const contactsWithCoords = contacts.filter(
      (c) => c.coordinate?.latitude && c.coordinate.longitude
    )
    return contactsWithCoords.map((c) => {
      const today = moment()
      const contactConvos = conversations.filter(
        (convo) => convo.contact.id === c.id
      )

      if (contactConvos.length === 0) {
        return {
          ...c,
          pinColor: theme.colors.textAlt,
        }
      }

      const conversationsSorted = [...contactConvos].sort(
        (a, b) => moment(b.date).unix() - moment(a.date).unix()
      )
      const mostRecentDate = moment(conversationsSorted[0].date)

      let pinColor: string = theme.colors.accent

      if (mostRecentDate.isBefore(today.subtract(1, 'week'))) {
        pinColor = theme.colors.warn
      }

      if (mostRecentDate.isBefore(today.subtract(1, 'month'))) {
        pinColor = theme.colors.error
      }

      return {
        ...c,
        pinColor: pinColor,
      }
    })
  }, [
    contacts,
    conversations,
    theme.colors.accent,
    theme.colors.error,
    theme.colors.textAlt,
    theme.colors.warn,
  ])

  return (
    <Wrapper insets='none' style={{ flexGrow: 1 }}>
      {!hasCompletedMapOnboarding ? (
        <MapOnboarding />
      ) : (
        <FullMapView contactMarkers={contactMarkers} />
      )}
    </Wrapper>
  )
}

export default MapScreen
