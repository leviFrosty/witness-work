import { MapPin as MapPinIcon, X as XIcon } from 'lucide-react-native'
import React, { useEffect, useRef, useState } from 'react'
import { ActivityIndicator, TouchableOpacity, View } from 'react-native'
import * as Location from 'expo-location'
import Text from '@/components/ui/MyText'
import MyTextInput from '@/components/ui/TextInput'
import LucideIcon from '@/components/ui/LucideIcon'
import InputRowContainer from '@/components/ui/inputs/InputRowContainer'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import { errorTracking } from '@/lib/errorTracking'
import {
  type Coordinate,
  type PlaceSuggestion,
  formatPlanLocation,
  isPlaceSearchAvailable,
  resolvePlace,
  searchPlaces,
} from '@/lib/placeSearch'
import type { PlanLocation } from '@/types/timeEntry'

const DEBOUNCE_MS = 250
const MIN_QUERY_LENGTH = 2
const MAX_SUGGESTIONS = 5
const SUGGESTION_ROW_MIN_HEIGHT = 44

interface PlaceSearchFieldProps {
  value?: PlanLocation
  onChange: (location?: PlanLocation) => void
  lastInSection?: boolean
}

/**
 * Bias results toward the publisher only when they've already granted location
 * access. Never prompts: a Plan's location is optional and not worth a
 * permission dialog.
 */
const useGrantedCoordinate = () => {
  const [coordinate, setCoordinate] = useState<Coordinate>()

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const permission = await Location.getForegroundPermissionsAsync()
        if (!permission.granted) return
        const position = await Location.getLastKnownPositionAsync()
        if (!position || cancelled) return
        setCoordinate({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        })
      } catch {
        // Location is only a ranking hint; search works without it.
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [])

  return coordinate
}

const SelectedPlace = ({
  location,
  onClear,
}: {
  location: PlanLocation
  onClear: () => void
}) => {
  const theme = useTheme()
  const { primary, secondary } = formatPlanLocation(location)

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <LucideIcon
        icon={MapPinIcon}
        size={theme.fontSize('lg')}
        color={theme.colors.textAlt}
      />
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Text
          numberOfLines={2}
          style={{
            fontFamily: theme.fonts.semiBold,
            fontSize: theme.fontSize('md'),
          }}
        >
          {primary}
        </Text>
        {secondary && (
          <Text
            numberOfLines={2}
            style={{
              color: theme.colors.textAlt,
              fontSize: theme.fontSize('sm'),
            }}
          >
            {secondary}
          </Text>
        )}
      </View>
      <TouchableOpacity
        onPress={onClear}
        accessibilityRole='button'
        accessibilityLabel={i18n.t('planLocation_clear')}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        style={{
          width: 44,
          height: 44,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <LucideIcon
          icon={XIcon}
          size={theme.fontSize('lg')}
          color={theme.colors.textAlt}
        />
      </TouchableOpacity>
    </View>
  )
}

const PlaceSearchInput = ({
  onSelect,
}: {
  onSelect: (location: PlanLocation) => void
}) => {
  const theme = useTheme()
  const near = useGrantedCoordinate()
  const [query, setQuery] = useState('')
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([])
  const [searching, setSearching] = useState(false)
  const [searchedQuery, setSearchedQuery] = useState<string>()
  const [resolvingId, setResolvingId] = useState<string>()
  /** Ignores responses from searches a newer keystroke has superseded. */
  const latestRequest = useRef(0)

  const trimmed = query.trim()

  useEffect(() => {
    const request = ++latestRequest.current
    if (trimmed.length < MIN_QUERY_LENGTH) {
      setSuggestions([])
      setSearching(false)
      setSearchedQuery(undefined)
      return
    }

    setSearching(true)
    const timeout = setTimeout(async () => {
      try {
        const results = await searchPlaces(trimmed, near)
        if (request !== latestRequest.current) return
        setSuggestions(results.slice(0, MAX_SUGGESTIONS))
      } catch (error) {
        if (request !== latestRequest.current) return
        errorTracking.captureException(error)
        setSuggestions([])
      } finally {
        if (request === latestRequest.current) {
          setSearching(false)
          setSearchedQuery(trimmed)
        }
      }
    }, DEBOUNCE_MS)

    return () => clearTimeout(timeout)
  }, [trimmed, near])

  const select = async (suggestion: PlaceSuggestion) => {
    setResolvingId(suggestion.id)
    try {
      const resolved = await resolvePlace(suggestion)
      // Without a MapKit match, keep what the publisher picked as a plain
      // address rather than dropping their choice.
      onSelect(
        resolved ?? {
          address: [suggestion.title, suggestion.subtitle]
            .filter(Boolean)
            .join(', '),
        }
      )
      setQuery('')
      setSuggestions([])
    } catch (error) {
      errorTracking.captureException(error)
    } finally {
      setResolvingId(undefined)
    }
  }

  const showNoResults =
    !searching &&
    searchedQuery === trimmed &&
    trimmed.length >= MIN_QUERY_LENGTH &&
    suggestions.length === 0

  return (
    <View style={{ gap: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <MyTextInput
          style={{ flex: 1, minWidth: 0 }}
          value={query}
          onChangeText={setQuery}
          placeholder={i18n.t('planLocation_placeholder')}
          placeholderTextColor={theme.colors.textAlt}
          accessibilityLabel={i18n.t('location')}
          textAlign='left'
          clearButtonMode='while-editing'
          autoCorrect={false}
          returnKeyType='search'
        />
        {searching && (
          <ActivityIndicator size='small' color={theme.colors.textAlt} />
        )}
      </View>
      {suggestions.length > 0 && (
        <View
          style={{
            borderRadius: theme.numbers.borderRadiusMd,
            borderWidth: 1,
            borderColor: theme.colors.border,
            overflow: 'hidden',
          }}
        >
          {suggestions.map((suggestion, index) => (
            <TouchableOpacity
              key={suggestion.id}
              accessibilityRole='button'
              accessibilityLabel={
                suggestion.subtitle
                  ? `${suggestion.title}, ${suggestion.subtitle}`
                  : suggestion.title
              }
              disabled={resolvingId !== undefined}
              onPress={() => select(suggestion)}
              style={{
                minHeight: SUGGESTION_ROW_MIN_HEIGHT,
                paddingHorizontal: 12,
                paddingVertical: 8,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 8,
                borderBottomWidth: index === suggestions.length - 1 ? 0 : 1,
                borderBottomColor: theme.colors.border,
              }}
            >
              <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                <Text
                  numberOfLines={1}
                  style={{ fontFamily: theme.fonts.semiBold }}
                >
                  {suggestion.title}
                </Text>
                {!!suggestion.subtitle && (
                  <Text
                    numberOfLines={1}
                    style={{
                      color: theme.colors.textAlt,
                      fontSize: theme.fontSize('sm'),
                    }}
                  >
                    {suggestion.subtitle}
                  </Text>
                )}
              </View>
              {resolvingId === suggestion.id && (
                <ActivityIndicator size='small' color={theme.colors.textAlt} />
              )}
            </TouchableOpacity>
          ))}
        </View>
      )}
      {showNoResults && (
        <Text
          style={{
            color: theme.colors.textAlt,
            fontSize: theme.fontSize('sm'),
          }}
        >
          {i18n.t('planLocation_noResults')}
        </Text>
      )}
    </View>
  )
}

/**
 * Optional Plan location, searched with Apple MapKit so points of interest
 * ("Kingdom Hall", a park) are found alongside street addresses. Renders
 * nothing on binaries without the native module.
 */
const PlaceSearchField = ({
  value,
  onChange,
  lastInSection,
}: PlaceSearchFieldProps) => {
  if (!isPlaceSearchAvailable) return null
  const hasValue = !!value && formatPlanLocation(value).primary !== ''

  return (
    <InputRowContainer
      label={i18n.t('location')}
      lastInSection={lastInSection}
      controlWidth='full'
    >
      {hasValue ? (
        <SelectedPlace location={value} onClear={() => onChange(undefined)} />
      ) : (
        <PlaceSearchInput onSelect={onChange} />
      )}
    </InputRowContainer>
  )
}

export default PlaceSearchField
