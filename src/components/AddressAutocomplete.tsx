import React, { useEffect, useCallback, useRef } from 'react'
import {
  View,
  TouchableOpacity,
  TextInput,
  AppState,
  Linking,
} from 'react-native'
import axios from 'axios'
import * as Location from 'expo-location'
import {
  faLocationArrow,
  faLocationCrosshairs,
} from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome'
import apis from '../constants/apis'
import Text from './MyText'
import useTheme from '../contexts/theme'
import { Address } from '../types/contact'
import i18n from '../lib/locales'
import { FlashList } from '@shopify/flash-list'
import TextInputRow from './inputs/TextInputRow'
import useLocation from '../hooks/useLocation'

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

const LocationStatusPill: React.FC<{
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

  const tint = granted ? theme.colors.accent : theme.colors.textAlt
  const background = granted
    ? theme.colors.accentTranslucent
    : theme.colors.background

  return (
    <TouchableOpacity
      onPress={handlePress}
      disabled={granted}
      activeOpacity={0.7}
      accessibilityRole={granted ? 'text' : 'button'}
      accessibilityLabel={label}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        alignSelf: 'flex-start',
        paddingVertical: 6,
        paddingHorizontal: 12,
        borderRadius: theme.numbers.borderRadiusLg,
        borderWidth: 1,
        borderColor: tint,
        backgroundColor: background,
      }}
    >
      <FontAwesomeIcon
        icon={granted ? faLocationArrow : faLocationCrosshairs}
        size={12}
        style={{ color: tint }}
      />
      <Text
        style={{
          color: tint,
          fontSize: theme.fontSize('sm'),
          fontFamily: theme.fonts.semiBold,
        }}
      >
        {label}
      </Text>
    </TouchableOpacity>
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
      }
    }

    const debounce = setTimeout(fetchSuggestions, DEBOUNCE_TIMEOUT_MS)
    return () => clearTimeout(debounce)
  }, [getHighlightedText, isResult, location, query, setError, setSuggestions])

  return (
    <View style={{ gap: 12 }}>
      <LocationStatusPill status={status} onRequest={requestLocation} />
      <TextInputRow
        ref={textInputRef}
        label={i18n.t('searchAddress')}
        textInputProps={{
          onChangeText: (text: string) => {
            setQuery(text)
            setIsResult(false)
          },
          placeholder: i18n.t('enterAddress'),
          value: query,
        }}
        lastInSection
      />
      {error ? (
        <Text
          style={{
            color: theme.colors.error,
            fontFamily: theme.fonts.semiBold,
          }}
        >
          {i18n.t('errorFetchingAddress')}
        </Text>
      ) : (
        <View style={{ minHeight: 2 }}>
          <FlashList
            data={suggestions}
            keyExtractor={(_, index) => index.toString()}
            renderItem={({ item }) => (
              <TouchableOpacity
                onPress={() => {
                  onSelect(item.address)
                  setQuery(item.title)
                  setIsResult(true)
                  textInputRef.current?.blur()
                  setSuggestions([])
                }}
                style={{
                  padding: 10,
                  borderBottomWidth: 1,
                  borderBottomColor: theme.colors.border,
                }}
              >
                <Text>{item.highlightedTitle}</Text>
              </TouchableOpacity>
            )}
          />
        </View>
      )}
    </View>
  )
}

export default AddressAutocomplete
