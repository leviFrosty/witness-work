import { LocateFixed as LocateFixedIcon } from 'lucide-react-native'
import LucideIcon from '@/components/ui/LucideIcon'
import React, { useEffect, useCallback, useRef, useState } from 'react'
import {
  View,
  TouchableOpacity,
  TextInput,
  AppState,
  Linking,
  ScrollView,
  type DimensionValue,
} from 'react-native'
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated'
import axios from 'axios'
import * as Location from 'expo-location'
import apis from '@/constants/apis'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import { Address } from '@/types/contact'
import i18n from '@/lib/locales'
import MyTextInput from '@/components/ui/TextInput'
import InfoPopover from '@/components/ui/InfoPopover'
import useLocation from '@/features/contacts/hooks/useLocation'

const SUGGESTION_ROW_HEIGHT = 44
const MAX_VISIBLE_SUGGESTIONS = 3

interface AddressAutocompleteProps {
  onSelect: (address: Address) => void
  query: string
  setQuery: React.Dispatch<React.SetStateAction<string>>
  isResult: boolean
  setIsResult: React.Dispatch<React.SetStateAction<boolean>>
  suggestions: Suggestion[]
  setSuggestions: React.Dispatch<React.SetStateAction<Suggestion[]>>
  error: boolean
  setError: React.Dispatch<React.SetStateAction<boolean>>
}

export interface Suggestion {
  title: string
  highlightedTitle: React.ReactNode
  address: Address
}

const SEARCH_RADIUS = 1000000
const DEBOUNCE_TIMEOUT_MS = 300
const MAX_SUGGESTIONS = 5

const LocationStatusControl: React.FC<{
  status: Location.PermissionStatus | null
  onRequest: () => void
}> = ({ status, onRequest }) => {
  const theme = useTheme()
  if (status === null) return null

  const granted = status === Location.PermissionStatus.GRANTED
  const denied = status === Location.PermissionStatus.DENIED

  const label = granted
    ? i18n.t('usingYourLocation')
    : denied
      ? i18n.t('locationOff_openSettings')
      : i18n.t('enableLocationForNearbyResults')

  const handlePress = () => {
    if (granted) return
    if (denied) {
      Linking.openSettings()
      return
    }
    onRequest()
  }

  if (granted) {
    return <InfoPopover title={i18n.t('searchAddress')} description={label} />
  }

  return (
    <TouchableOpacity
      onPress={handlePress}
      activeOpacity={0.7}
      accessibilityRole='button'
      accessibilityLabel={label}
      style={{
        width: 44,
        height: 44,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <LucideIcon
        icon={LocateFixedIcon}
        size={theme.fontSize('md')}
        style={{ color: theme.colors.textAlt }}
      />
    </TouchableOpacity>
  )
}

const SKELETON_ROW_WIDTHS: DimensionValue[] = ['70%', '55%', '80%']

const SkeletonRow: React.FC<{ isLast: boolean; width: DimensionValue }> = ({
  isLast,
  width,
}) => {
  const theme = useTheme()
  const opacity = useSharedValue(0.35)

  useEffect(() => {
    opacity.value = withRepeat(withTiming(0.85, { duration: 700 }), -1, true)
  }, [opacity])

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }))

  return (
    <View
      style={{
        minHeight: SUGGESTION_ROW_HEIGHT,
        paddingHorizontal: 12,
        paddingVertical: 10,
        justifyContent: 'center',
        borderBottomWidth: isLast ? 0 : 1,
        borderBottomColor: theme.colors.border,
      }}
    >
      <Animated.View
        style={[
          {
            height: 12,
            width,
            borderRadius: 4,
            backgroundColor: theme.colors.border,
          },
          animatedStyle,
        ]}
      />
    </View>
  )
}

const AddressAutocomplete: React.FC<AddressAutocompleteProps> = ({
  query,
  setQuery,
  isResult,
  setIsResult,
  suggestions,
  setSuggestions,
  error,
  setError,
  onSelect,
}) => {
  const textInputRef = useRef<TextInput>(null)
  const { location, status, requestLocation, refreshStatus } = useLocation()
  const theme = useTheme()
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'active') {
        refreshStatus()
      }
    })
    return () => subscription.remove()
  }, [refreshStatus])

  const getHighlightedText = useCallback(
    (
      text: string,
      highlights: { start: number; end: number }[]
    ): React.ReactNode => {
      if (!highlights || highlights.length === 0) {
        return <Text>{text}</Text>
      }

      const result: React.ReactNode[] = []
      let lastIndex = 0

      highlights.forEach((highlight, index) => {
        if (highlight.start > lastIndex) {
          result.push(
            <Text
              key={`normal-${index}`}
              style={{ color: theme.colors.textAlt }}
            >
              {text.slice(lastIndex, highlight.start)}
            </Text>
          )
        }

        result.push(
          <Text key={`highlight-${index}`} style={{ fontWeight: 'bold' }}>
            {text.slice(highlight.start, highlight.end)}
          </Text>
        )
        lastIndex = highlight.end
      })

      if (lastIndex < text.length) {
        result.push(
          <Text key='normal-end' style={{ color: theme.colors.textAlt }}>
            {text.slice(lastIndex)}
          </Text>
        )
      }

      return <React.Fragment>{result}</React.Fragment>
    },
    [theme.colors.textAlt]
  )

  useEffect(() => {
    const fetchSuggestions = async () => {
      if (query.length < 3 || isResult) {
        setSuggestions([])
        setIsLoading(false)
        return
      }

      try {
        const autocompleteUrl = `${apis.autocomplete}?q=${encodeURIComponent(query)}&limit=${MAX_SUGGESTIONS}${location ? `&in=circle:${location.coords.latitude},${location.coords.longitude};r=${SEARCH_RADIUS}` : ''}`
        const response = await axios.get(autocompleteUrl)

        if (response.status !== 200) {
          throw new Error('Error fetching address suggestions')
        }

        const results = response.data.items
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .map((item: any) => {
            const address: Address = {
              line1: item.address.houseNumber
                ? `${item.address.houseNumber} ${item.address.street}`
                : item.address.street,
              city: item.address.city,
              state: item.address.state,
              zip: item.address.postalCode,
              country: item.address.countryName,
            }

            return {
              title: item.address.label,
              highlightedTitle: getHighlightedText(
                item.address.label,
                item.highlights.address.label
              ),
              address,
            }
          })
        setSuggestions(results)
      } catch (error) {
        setError(true)
        setSuggestions([])
      } finally {
        setIsLoading(false)
      }
    }

    const debounce = setTimeout(fetchSuggestions, DEBOUNCE_TIMEOUT_MS)
    return () => clearTimeout(debounce)
  }, [getHighlightedText, isResult, location, query, setError, setSuggestions])

  const showFloatingResults =
    !error && !isResult && (suggestions.length > 0 || isLoading)

  return (
    <View style={{ gap: 8, zIndex: 10 }}>
      <View style={{ position: 'relative', zIndex: 20 }}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            paddingLeft: 12,
            paddingRight: status === null ? 12 : 0,
            paddingBottom: 8,
          }}
        >
          <MyTextInput
            ref={textInputRef}
            accessibilityLabel={i18n.t('enterAddress')}
            style={{ flex: 1, minWidth: 0 }}
            onChangeText={(text: string) => {
              setQuery(text)
              setIsResult(false)
              // Show loading rows while debounce and the request are pending.
              setIsLoading(text.length >= 3)
              if (text === '') {
                // Clear structured fields too, so stale values cannot survive save.
                onSelect({
                  line1: '',
                  line2: '',
                  city: '',
                  state: '',
                  zip: '',
                  country: '',
                })
              }
            }}
            onBlur={() => {
              setSuggestions([])
              setIsLoading(false)
            }}
            placeholder={i18n.t('enterAddress')}
            value={query}
            textAlign='left'
          />
          <LocationStatusControl status={status} onRequest={requestLocation} />
        </View>
        {showFloatingResults && (
          <View
            style={{
              position: 'absolute',
              top: '100%',
              left: 0,
              right: 0,
              marginTop: 6,
              backgroundColor: theme.colors.card,
              borderRadius: theme.numbers.borderRadiusMd,
              borderWidth: 1,
              borderColor: theme.colors.border,
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.15,
              shadowRadius: 12,
              elevation: 8,
              maxHeight: SUGGESTION_ROW_HEIGHT * MAX_VISIBLE_SUGGESTIONS,
              overflow: 'hidden',
              zIndex: 20,
            }}
          >
            <ScrollView
              keyboardShouldPersistTaps='handled'
              nestedScrollEnabled
              showsVerticalScrollIndicator={
                suggestions.length > MAX_VISIBLE_SUGGESTIONS
              }
            >
              {isLoading && suggestions.length === 0
                ? SKELETON_ROW_WIDTHS.map((width, index) => (
                    <SkeletonRow
                      key={`skeleton-${index}`}
                      width={width}
                      isLast={index === SKELETON_ROW_WIDTHS.length - 1}
                    />
                  ))
                : suggestions.map((item, index) => (
                    <TouchableOpacity
                      key={index}
                      accessibilityRole='button'
                      accessibilityLabel={item.title}
                      onPress={() => {
                        onSelect(item.address)
                        setQuery(item.title)
                        setIsResult(true)
                        setSuggestions([])
                        setIsLoading(false)
                      }}
                      style={{
                        minHeight: SUGGESTION_ROW_HEIGHT,
                        paddingHorizontal: 12,
                        paddingVertical: 10,
                        justifyContent: 'center',
                        borderBottomWidth:
                          index === suggestions.length - 1 ? 0 : 1,
                        borderBottomColor: theme.colors.border,
                      }}
                    >
                      <Text numberOfLines={2}>{item.highlightedTitle}</Text>
                    </TouchableOpacity>
                  ))}
            </ScrollView>
          </View>
        )}
      </View>
      {error && (
        <View style={{ paddingHorizontal: 12 }}>
          <Text
            style={{
              color: theme.colors.error,
              fontFamily: theme.fonts.semiBold,
            }}
          >
            {i18n.t('errorFetchingAddress')}
          </Text>
        </View>
      )}
    </View>
  )
}

export default AddressAutocomplete
