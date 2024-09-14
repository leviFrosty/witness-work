import { Alert, ScrollView, View } from 'react-native'

import { countTruthyValueStrings } from '../lib/objects'
import {
  fetchCoordinateFromAddress,
  requestLocationPermission,
} from '../lib/address'
import Loader from '../components/Loader'
import { Progress } from 'tamagui'
import AnimatedLottieView from 'lottie-react-native'
import Circle from '../components/Circle'
import { usePreferences } from '../stores/preferences'
import useContacts from '../stores/contactsStore'
import useTheme from '../contexts/theme'
import { useNavigation } from '@react-navigation/native'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Contact } from '../types/contact'
import i18n from '../lib/locales'
import Wrapper from './layout/Wrapper'
import Text from './MyText'
import ActionButton from './ActionButton'
import Button from './Button'
import Card from './Card'
import { HomeTabStackNavigation } from '../types/homeStack'

export default function MapOnboarding() {
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
              {i18n.t('witnessWorkWillShowYouYourLocation')}
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
