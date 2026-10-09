import { Address, Contact, Coordinate } from '@/types/contact'
import { HereGeocodeResponse } from '@/types/here'
import apis from '@/constants/apis'
import { errorTracking } from '@/lib/errorTracking'
import { errorBodyCode } from '@/lib/http/errorBody'
import { classifyNetworkError } from '@/lib/http/networkError'
import { HttpError, request } from '@/lib/http/request'
import { Platform } from 'react-native'
import { resolveNavigationMapProvider } from '@/lib/navigationMapProvider'
import i18n from '@/lib/locales'
import { countTruthyValueStrings } from '@/lib/objects'
import * as Location from 'expo-location'
import { DefaultNavigationMapProvider } from '@/stores/preferences'
import links from '@/constants/links'
import { openURL } from '@/lib/links'
import { addressToString } from '@/lib/addressToString'

export { addressToString }

/** HERE answers in about a second; past this the lookup is stuck. */
const GEOCODE_TIMEOUT_MS = 10_000

/**
 * The coordinate for `address`, or null when there's nothing to look up or HERE
 * finds no match. Throws an `HttpError` when the lookup itself fails (offline,
 * timed out, cancelled, rate limited, a server error), so each caller decides
 * what to tell the publisher. Only failures that look like bugs are reported.
 */
export const fetchCoordinateFromAddress = async (
  incrementGeocodeApiCallCount: () => void,
  address?: Address,
  signal?: AbortSignal
): Promise<Coordinate | null> => {
  if (!address || countTruthyValueStrings(address) === 0) {
    return null
  }

  try {
    const addressString = addressToString(address)

    incrementGeocodeApiCallCount()
    // One retry that honours Retry-After (60 s on a 429), which paces the map
    // onboarding batch under ww-api's per-IP limit instead of failing every
    // contact after the 60th.
    const { data } = await request<HereGeocodeResponse>({
      url: `${apis.geocode}?q=${encodeURIComponent(addressString)}&limit=1`,
      timeoutMs: GEOCODE_TIMEOUT_MS,
      signal,
      retry: { retries: 1, maxDelayMs: 60_000 },
    })

    if (!Array.isArray(data?.items)) {
      throw new HttpError('unknown', null, null, null, 'invalid geocode')
    }

    const position = data.items[0]?.position
    if (typeof position?.lat !== 'number' || typeof position.lng !== 'number') {
      return null
    }

    return {
      latitude: position.lat,
      longitude: position.lng,
    }
  } catch (error) {
    // ww-api passes HERE's 404 through: no match, same as an empty list.
    if (errorBodyCode(error) === 'not_found') return null
    const kind = classifyNetworkError(error)
    if (kind === 'unknown' || kind === 'client') {
      errorTracking.captureException(error)
    }
    throw error
  }
}

export const navigateTo = (
  contact: Contact,
  provider: DefaultNavigationMapProvider
) => {
  const getScheme = () => {
    switch (resolveNavigationMapProvider(provider, Platform.OS)) {
      case 'apple':
        return links.appleMapsBase
      case 'google':
        return links.googleMapsBase
      case 'waze':
        return links.wazeMapsBase
      default:
        return links.appleMapsBase
    }
  }

  let url = getScheme()
  if (contact.userDraggedCoordinate) {
    url += encodeURI(coordinateAsString(contact))
  } else {
    url += encodeURI(addressToString(contact.address))
  }

  openURL(url, {
    alert: {
      title: i18n.t('couldNotOpenMaps'),
      description: i18n.t('couldNotOpenMaps_description'),
    },
  })
}

export const requestLocationPermission = async (
  callBack?: (status: boolean) => void
) => {
  const { granted } = await Location.requestForegroundPermissionsAsync()
  callBack?.(granted)
}

export const coordinateAsString = (contact?: Contact) => {
  if (!contact) {
    return ''
  }
  return `${contact.coordinate?.latitude}, ${contact.coordinate?.longitude}`
}
