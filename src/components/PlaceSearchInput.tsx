import { LocateFixed as LocateFixedIcon } from 'lucide-react-native'
import { useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Linking,
  TouchableOpacity,
  View,
} from 'react-native'
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
import { addForegroundListener } from '@/lib/appLifecycle'
import { errorTracking } from '@/lib/errorTracking'
import { classifyNetworkError } from '@/lib/http/networkError'
import {
  isUnexpectedPlaceSearchError,
  type PlaceSearchFailure,
  type PlaceSearchScope,
  type PlaceSuggestion,
  type ResolvedPlace,
  placeSearchFailure,
  resolvePlace,
  searchPlaces,
} from '@/lib/placeSearch'

const DEBOUNCE_MS = 250
const MIN_QUERY_LENGTH = 2
const MAX_SUGGESTIONS = 5
const SUGGESTION_ROW_MIN_HEIGHT = 44

const FAILURE_MESSAGE_KEYS = {
  offline: 'placeSearch_error_offline',
  busy: 'placeSearch_error_busy',
  failed: 'errorFetchingAddress',
} as const satisfies Record<PlaceSearchFailure, string>

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
          <ActivityIndicator
            size='small'
            color={theme.colors.textAlt}
            accessibilityLabel={i18n.t('placeSearch_loadingPlace')}
          />
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
  const [error, setError] = useState<PlaceSearchFailure>()
  const [resolveError, setResolveError] = useState<PlaceSearchFailure>()
  const [resolvingId, setResolvingId] = useState<string>()

  const trimmed = query.trim()
  const latitude = location?.coords.latitude
  const longitude = location?.coords.longitude

  // Settings is where location access gets turned back on.
  useEffect(() => {
    const subscription = addForegroundListener(refreshStatus)
    return () => subscription.remove()
  }, [refreshStatus])

  useEffect(() => {
    // An old message is about an old query, and the spinner waits for the
    // debounce so typing doesn't look like loading.
    setError(undefined)
    setResolveError(undefined)
    setSearching(false)
    if (!searchEnabled || trimmed.length < MIN_QUERY_LENGTH) {
      setSuggestions([])
      setSearchedQuery(undefined)
      return
    }

    const near =
      latitude !== undefined && longitude !== undefined
        ? { latitude, longitude }
        : undefined
    // Aborting a superseded search keeps it off ww-api's per-IP rate limit,
    // and drops its late answer.
    const controller = new AbortController()
    const timeout = setTimeout(async () => {
      setSearching(true)
      try {
        const results = await searchPlaces(
          trimmed,
          near,
          scope,
          controller.signal
        )
        if (controller.signal.aborted) return
        setSuggestions(results.slice(0, MAX_SUGGESTIONS))
      } catch (searchError) {
        if (controller.signal.aborted) return
        if (isUnexpectedPlaceSearchError(searchError)) {
          errorTracking.captureException(searchError)
        }
        setSuggestions([])
        setError(placeSearchFailure(searchError))
      } finally {
        if (!controller.signal.aborted) {
          setSearching(false)
          setSearchedQuery(trimmed)
        }
      }
    }, DEBOUNCE_MS)

    return () => {
      clearTimeout(timeout)
      controller.abort()
    }
  }, [trimmed, latitude, longitude, scope, searchEnabled])

  const select = async (suggestion: PlaceSuggestion) => {
    setResolvingId(suggestion.id)
    setResolveError(undefined)
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
    } catch (failure) {
      // Keep the suggestions so they can pick again.
      if (isUnexpectedPlaceSearchError(failure)) {
        errorTracking.captureException(failure)
      }
      if (classifyNetworkError(failure) !== 'cancelled') {
        setResolveError(placeSearchFailure(failure))
      }
    } finally {
      setResolvingId(undefined)
    }
  }

  const failure = resolveError ?? error
  const failureMessage =
    resolveError === 'failed'
      ? i18n.t('placeSearch_error_resolve')
      : failure && i18n.t(FAILURE_MESSAGE_KEYS[failure])

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
            accessibilityLabel={i18n.t('placeSearch_searching')}
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
      {!!failureMessage && (
        <Text
          accessibilityLiveRegion='polite'
          style={{
            color: theme.colors.error,
            fontFamily: theme.fonts.semiBold,
          }}
        >
          {failureMessage}
        </Text>
      )}
      {showNoResults && <Empty title={i18n.t('planLocation_noResults')} />}
    </View>
  )
}
