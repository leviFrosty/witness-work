import {
  ActivityIndicator,
  FlatList,
  ScrollView,
  TouchableOpacity,
  View,
} from 'react-native'

import { countTruthyValueStrings } from '@/lib/objects'
import {
  addressToString,
  fetchCoordinateFromAddress,
  requestLocationPermission,
} from '@/lib/address'
import AnimatedLottieView from 'lottie-react-native'
import { usePreferences } from '@/stores/preferences'
import useContacts from '@/stores/contactsStore'
import useTheme from '@/contexts/theme'
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs'
import { useNavigation } from '@react-navigation/native'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Contact } from '@/types/contact'
import i18n from '@/lib/locales'
import Wrapper from '@/components/ui/layout/Wrapper'
import Text from '@/components/ui/MyText'
import ActionButton from '@/components/ui/ActionButton'
import Button from '@/components/ui/Button'
import { HomeTabStackNavigation } from '@/types/homeStack'
import MapKey from '@/features/map/components/MapColorKey'
import Checkbox from 'expo-checkbox'
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome'
import { faCheck, faCircleExclamation } from '@fortawesome/free-solid-svg-icons'

type FetchStatus = 'idle' | 'loading' | 'success' | 'error'

export default function MapOnboarding() {
  const { incrementGeocodeApiCallCount, set } = usePreferences()
  const { contacts, updateContact } = useContacts()
  const theme = useTheme()
  const navigation = useNavigation<HomeTabStackNavigation>()
  const abortController = useRef<AbortController | null>(null)
  const insets = useSafeAreaInsets()
  const tabBarHeight = useBottomTabBarHeight()
  const [fetching, setFetching] = useState(false)
  const [locationPermissions, setLocationPermissions] = useState<boolean>()
  const [statuses, setStatuses] = useState<Record<string, FetchStatus>>({})
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [fetchSnapshot, setFetchSnapshot] = useState<Contact[]>([])

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

  const hasFetched = Object.keys(statuses).length > 0
  const listData = hasFetched
    ? fetchSnapshot
    : oldContactsWithAddressWithoutCoordinates

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }, [])

  const allSelected =
    oldContactsWithAddressWithoutCoordinates.length > 0 &&
    selectedIds.size === oldContactsWithAddressWithoutCoordinates.length

  const toggleSelectAll = useCallback(() => {
    if (allSelected) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(
        new Set(oldContactsWithAddressWithoutCoordinates.map((c) => c.id))
      )
    }
  }, [allSelected, oldContactsWithAddressWithoutCoordinates])

  const fetchContacts = useCallback(
    async (contactsToFetch: Contact[]) => {
      setFetching(true)
      setFetchSnapshot(contactsToFetch)
      abortController.current = new AbortController()

      const initialStatuses: Record<string, FetchStatus> = {}
      contactsToFetch.forEach((c) => {
        initialStatuses[c.id] = 'loading'
      })
      setStatuses(initialStatuses)

      const queue = [...contactsToFetch]

      const worker = async () => {
        while (queue.length > 0) {
          const contact = queue.shift()
          if (!contact) break
          try {
            const position = await fetchCoordinateFromAddress(
              incrementGeocodeApiCallCount,
              contact.address,
              abortController.current ?? undefined
            )
            if (position) {
              updateContact({ ...contact, coordinate: position })
              setStatuses((prev) => ({ ...prev, [contact.id]: 'success' }))
            } else {
              setStatuses((prev) => ({ ...prev, [contact.id]: 'error' }))
            }
          } catch {
            setStatuses((prev) => ({ ...prev, [contact.id]: 'error' }))
          }
        }
      }

      await Promise.all(Array.from({ length: 3 }, worker))

      setFetching(false)
    },
    [incrementGeocodeApiCallCount, updateContact]
  )

  useEffect(() => {
    const unsubscribe = navigation.addListener('blur', () => {
      abortController.current?.abort()
      setFetching(false)
    })
    return unsubscribe
  }, [navigation])

  const goNext = () => {
    setStep((s) => s + 1)
  }

  const handleFetchPress = () => {
    const toFetch =
      selectedIds.size > 0
        ? oldContactsWithAddressWithoutCoordinates.filter((c) =>
            selectedIds.has(c.id)
          )
        : oldContactsWithAddressWithoutCoordinates
    fetchContacts(toFetch)
  }

  const fetchButtonLabel =
    selectedIds.size > 0
      ? i18n.t('fetchSelected', { count: selectedIds.size })
      : i18n.t('fetchAll')

  const renderContactRow = ({ item: contact }: { item: Contact }) => {
    const status = statuses[contact.id] ?? 'idle'
    const isSelected = selectedIds.has(contact.id)

    return (
      <TouchableOpacity
        onPress={() => toggleSelect(contact.id)}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
          paddingVertical: 10,
        }}
        activeOpacity={0.7}
        disabled={hasFetched}
      >
        {!hasFetched && (
          <Checkbox
            value={isSelected}
            onValueChange={() => toggleSelect(contact.id)}
            disabled={fetching}
            color={isSelected ? theme.colors.accent : undefined}
          />
        )}
        <View style={{ flex: 1 }}>
          <Text
            style={{
              fontFamily: theme.fonts.semiBold,
              fontSize: theme.fontSize('sm'),
            }}
          >
            {contact.name}
          </Text>
          <Text
            numberOfLines={1}
            style={{
              color: theme.colors.textAlt,
              fontSize: theme.fontSize('xs'),
            }}
          >
            {addressToString(contact.address)}
          </Text>
        </View>
        <View style={{ width: 20, alignItems: 'center' }}>
          {status === 'loading' && (
            <ActivityIndicator size='small' color={theme.colors.accent} />
          )}
          {status === 'success' && (
            <FontAwesomeIcon
              icon={faCheck}
              color={theme.colors.accent}
              size={14}
            />
          )}
          {status === 'error' && (
            <FontAwesomeIcon
              icon={faCircleExclamation}
              color={theme.colors.warn}
              size={14}
            />
          )}
        </View>
      </TouchableOpacity>
    )
  }

  return (
    <Wrapper
      insets='none'
      style={{
        flexGrow: 1,
        paddingHorizontal: 20,
        paddingTop: insets.top + 60,
        paddingBottom: tabBarHeight + 20,
      }}
    >
      {step === 0 && (
        <View style={{ flex: 1, gap: 16 }}>
          <View style={{ gap: 6 }}>
            <Text
              style={{
                fontSize: theme.fontSize('xl'),
                fontFamily: theme.fonts.bold,
              }}
            >
              {i18n.t('updateContacts')}
            </Text>
            {!hasFetched && (
              <Text style={{ color: theme.colors.textAlt }}>
                {i18n.t('contactsMissingCoordinates', {
                  count: oldContactsWithAddressWithoutCoordinates.length,
                })}
              </Text>
            )}
          </View>

          {!hasFetched &&
          oldContactsWithAddressWithoutCoordinates.length === 0 ? (
            <View
              style={{
                flex: 1,
                justifyContent: 'center',
                alignItems: 'center',
              }}
            >
              <AnimatedLottieView
                autoPlay={true}
                loop={false}
                style={{ width: 160, height: 160 }}
                source={require('@/assets/lottie/checkMark.json')}
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
          ) : (
            <>
              {!hasFetched && (
                <TouchableOpacity onPress={toggleSelectAll}>
                  <Text
                    style={{
                      color: theme.colors.accent,
                      fontSize: theme.fontSize('sm'),
                    }}
                  >
                    {allSelected ? i18n.t('deselectAll') : i18n.t('selectAll')}
                  </Text>
                </TouchableOpacity>
              )}
              <FlatList
                data={listData}
                keyExtractor={(c) => c.id}
                renderItem={renderContactRow}
                ItemSeparatorComponent={() => (
                  <View
                    style={{ height: 1, backgroundColor: theme.colors.border }}
                  />
                )}
              />
            </>
          )}

          <View style={{ gap: 10 }}>
            {!hasFetched && (
              <ActionButton disabled={fetching} onPress={handleFetchPress}>
                <Text style={{ color: theme.colors.textInverse }}>
                  {fetchButtonLabel}
                </Text>
              </ActionButton>
            )}
            {(hasFetched ||
              oldContactsWithAddressWithoutCoordinates.length === 0) && (
              <ActionButton disabled={fetching} onPress={goNext}>
                <Text style={{ color: theme.colors.textInverse }}>
                  {i18n.t('continue')}
                </Text>
              </ActionButton>
            )}
            {oldContactsWithAddressWithoutCoordinates.length > 0 && (
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
            <MapKey />
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
