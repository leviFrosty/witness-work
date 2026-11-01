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

const GEOCODE_TIMEOUT_MS = 10_000

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
  const getBase = () => {
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

  const query = encodeURIComponent(
    contact.userDraggedCoordinate
      ? coordinateAsString(contact)
      : addressToString(contact.address)
  )
  const base = getBase()

  openURL(`${base}${query}`, {
    alert: {
      title: i18n.t('couldNotOpenMaps'),
      description: i18n.t('couldNotOpenMaps_description'),
    },

    fallbackUrl:
      base === links.appleMapsBase
        ? `${links.googleMapsBase}${query}`
        : undefined,
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
