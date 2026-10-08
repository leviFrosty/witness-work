import { LocateFixed as LocateFixedIcon } from 'lucide-react-native'
import { useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator,
  AppState,
  Linking,
  TouchableOpacity,
  View,
} from 'react-native'
import { isAxiosError } from 'axios'
import * as Location from 'expo-location'
import Text from '@/components/ui/MyText'
import Empty from '@/components/ui/Empty'
import MyTextInput from '@/components/ui/TextInput'
import LucideIcon from '@/components/ui/LucideIcon'
import InfoPopover from '@/components/ui/InfoPopover'
import PointerHover, { HoverTint } from '@/components/ui/PointerHover'
import PointerTooltip from '@/components/ui/PointerTooltip'
import useTheme from '@/contexts/theme'
import useLocation from '@/hooks/useLocation'
import i18n from '@/lib/locales'
import { errorTracking } from '@/lib/errorTracking'
import {
  type PlaceSearchScope,
  type PlaceSuggestion,
  type ResolvedPlace,
  resolvePlace,
  searchPlaces,
} from '@/lib/placeSearch'

const DEBOUNCE_MS = 250
const MIN_QUERY_LENGTH = 2
const MAX_SUGGESTIONS = 5
const SUGGESTION_ROW_MIN_HEIGHT = 44

/**
 * Nearby results need location access, but search works without it, so this
 * never prompts on its own. Tapping asks (or opens Settings once declined).
 */
const LocationStatusControl = ({
  status,
  onRequest,
}: {
  status: Location.PermissionStatus | null
  onRequest: () => void
}) => {
  const theme = useTheme()
  if (status === null) return null

  if (status === Location.PermissionStatus.GRANTED) {
    return (
      <InfoPopover
        title={i18n.t('searchAddress')}
        description={i18n.t('usingYourLocation')}
        centered
      />
    )
  }

  const denied = status === Location.PermissionStatus.DENIED
  const label = denied
    ? i18n.t('locationOff_openSettings')
    : i18n.t('enableLocationForNearbyResults')

  return (
    <PointerTooltip label={label} style={{ borderRadius: 22 }}>
      <TouchableOpacity
        onPress={denied ? () => Linking.openSettings() : onRequest}
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
    </PointerTooltip>
  )
}

const SuggestionRow = ({
  suggestion,
  isLast,
  resolving,
  disabled,
  onPress,
}: {
  suggestion: PlaceSuggestion
  isLast: boolean
  resolving: boolean
  disabled: boolean
  onPress: () => void
}) => {
  const theme = useTheme()
  const [hovered, setHovered] = useState(false)

  return (
    <PointerHover onHoverChange={setHovered}>
      <TouchableOpacity
        accessibilityRole='button'
        accessibilityLabel={
          suggestion.subtitle
            ? `${suggestion.title}, ${suggestion.subtitle}`
            : suggestion.title
        }
        disabled={disabled}
        onPress={onPress}
        style={{
          minHeight: SUGGESTION_ROW_MIN_HEIGHT,
          paddingHorizontal: 12,
          paddingVertical: 8,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          borderBottomWidth: isLast ? 0 : 1,
          borderBottomColor: theme.colors.border,
        }}
      >
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <Text numberOfLines={1} style={{ fontFamily: theme.fonts.semiBold }}>
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
        {resolving && (
          <ActivityIndicator size='small' color={theme.colors.textAlt} />
        )}
        <HoverTint visible={hovered} />
      </TouchableOpacity>
    </PointerHover>
  )
}

interface PlaceSearchInputProps {
  /** `address` for street addresses only; `all` adds points of interest. */
  scope: PlaceSearchScope
  query: string
  onChangeQuery: (query: string) => void
  onSelect: (place: ResolvedPlace) => void
  /** False while the query shows a place that was already picked. */
  searchEnabled?: boolean
  placeholder: string
  accessibilityLabel: string
  /** Drops the field's border and fill, for a field that sits in a row. */
  borderless?: boolean
  onFocus?: () => void
  onBlur?: () => void
}

/**
 * Search field for places and addresses: Apple MapKit on iOS, HERE for
 * addresses elsewhere (see `placeSearchProvider`). Results are biased toward
 * the publisher when they've shared their location; the button beside the field
 * shows whether they have and lets them turn it on.
 */
export default function PlaceSearchInput({
  scope,
  query,
  onChangeQuery,
  onSelect,
  searchEnabled = true,
  placeholder,
  accessibilityLabel,
  borderless,
  onFocus,
  onBlur,
}: PlaceSearchInputProps) {
  const theme = useTheme()
  const { location, status, requestLocation, refreshStatus } = useLocation()
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([])
  const [searching, setSearching] = useState(false)
  const [searchedQuery, setSearchedQuery] = useState<string>()
  const [error, setError] = useState(false)
  const [resolvingId, setResolvingId] = useState<string>()
  /** Ignores responses from searches a newer keystroke has superseded. */
  const latestRequest = useRef(0)

  const trimmed = query.trim()
  const latitude = location?.coords.latitude
  const longitude = location?.coords.longitude

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'active') refreshStatus()
    })
    return () => subscription.remove()
  }, [refreshStatus])

  useEffect(() => {
    const request = ++latestRequest.current
    if (!searchEnabled || trimmed.length < MIN_QUERY_LENGTH) {
      setSuggestions([])
      setSearching(false)
      setSearchedQuery(undefined)
      setError(false)
      return
    }

    setSearching(true)
    const near =
      latitude !== undefined && longitude !== undefined
        ? { latitude, longitude }
        : undefined
    const timeout = setTimeout(async () => {
      try {
        const results = await searchPlaces(trimmed, near, scope)
        if (request !== latestRequest.current) return
        setSuggestions(results.slice(0, MAX_SUGGESTIONS))
        setError(false)
      } catch (searchError) {
        if (request !== latestRequest.current) return
        // Offline and HERE outages show the inline error; anything else is a bug.
        if (!isAxiosError(searchError)) {
          errorTracking.captureException(searchError)
        }
        setSuggestions([])
        setError(true)
      } finally {
        if (request === latestRequest.current) {
          setSearching(false)
          setSearchedQuery(trimmed)
        }
      }
    }, DEBOUNCE_MS)

    return () => clearTimeout(timeout)
  }, [trimmed, latitude, longitude, scope, searchEnabled])

  const select = async (suggestion: PlaceSuggestion) => {
    setResolvingId(suggestion.id)
    try {
      const resolved = await resolvePlace(suggestion)
      // Without a match, keep what the publisher picked as a plain address
      // rather than dropping their choice.
      onSelect(
        resolved ?? {
          address: [suggestion.title, suggestion.subtitle]
            .filter(Boolean)
            .join(', '),
        }
      )
      setSuggestions([])
    } catch (resolveError) {
      errorTracking.captureException(resolveError)
    } finally {
      setResolvingId(undefined)
    }
  }

  const showNoResults =
    !searching &&
    !error &&
    searchEnabled &&
    searchedQuery === trimmed &&
    trimmed.length >= MIN_QUERY_LENGTH &&
    suggestions.length === 0

  return (
    <View style={{ gap: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <MyTextInput
          style={{
            flex: 1,
            minWidth: 0,
            ...(borderless && {
              borderWidth: 0,
              backgroundColor: 'transparent',
              paddingHorizontal: 0,
            }),
          }}
          value={query}
          onChangeText={onChangeQuery}
          onFocus={onFocus}
          onBlur={onBlur}
          placeholder={placeholder}
          placeholderTextColor={theme.colors.textAlt}
          accessibilityLabel={accessibilityLabel}
          textAlign='left'
          clearButtonMode='while-editing'
          autoCorrect={false}
          returnKeyType='search'
        />
        {searching && (
          <ActivityIndicator
            size='small'
            color={theme.colors.textAlt}
            style={{ marginLeft: 8 }}
          />
        )}
        <LocationStatusControl status={status} onRequest={requestLocation} />
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
            <SuggestionRow
              key={suggestion.id}
              suggestion={suggestion}
              isLast={index === suggestions.length - 1}
              resolving={resolvingId === suggestion.id}
              disabled={resolvingId !== undefined}
              onPress={() => select(suggestion)}
            />
          ))}
        </View>
      )}
      {error && (
        <Text
          style={{
            color: theme.colors.error,
            fontFamily: theme.fonts.semiBold,
          }}
        >
          {i18n.t('errorFetchingAddress')}
        </Text>
      )}
      {showNoResults && <Empty title={i18n.t('planLocation_noResults')} />}
    </View>
  )
}
