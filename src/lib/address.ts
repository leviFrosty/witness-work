import { Address, Contact, Coordinate } from '@/types/contact'
import axios from 'axios'
import { HereGeocodeResponse } from '@/types/here'
import apis from '@/constants/apis'
import * as Network from 'expo-network'
import * as Sentry from '@sentry/react-native'
import { Alert } from 'react-native'
import i18n from '@/lib/locales'
import { countTruthyValueStrings } from '@/lib/objects'
import * as Location from 'expo-location'
import { DefaultNavigationMapProvider } from '@/stores/preferences'
import links from '@/constants/links'
import { openURL } from '@/lib/links'

export const addressToString = (address?: Address) => {
  if (!address) {
    return ''
  }

  return Object.keys(address)
    .reduce(
      (prev, line, index) =>
        !address[line as keyof Address]?.length
          ? prev
          : (prev += `${index !== 0 ? ' ' : ''}${
              address[line as keyof Address]
            }`),
      ''
    )
    .replace(/(\r\n|\n|\r)/gm, '')
}

export const fetchCoordinateFromAddress = async (
  incrementGeocodeApiCallCount: () => void,
  address?: Address,
  abortController?: AbortController
): Promise<Coordinate | null> => {
  if (!address) {
    return null
  }

  if (countTruthyValueStrings(address) === 0) {
    return null
  }

  const { isInternetReachable } = await Network.getNetworkStateAsync()

  if (!isInternetReachable) {
    Alert.alert(
      i18n.t('internetUnavailable'),
      i18n.t('couldNotFetchCoordinatesFromAddress')
    )
    return null
  }

  try {
    const addressString = addressToString(address)

    incrementGeocodeApiCallCount()
    const { data } = await axios.get<HereGeocodeResponse>(
      `${apis.geocode}?q=${encodeURIComponent(addressString)}&limit=1`,
      {
        signal: abortController?.signal,
      }
    )

    if (data.items.length === 0) {
      return null
    }

    const position = data.items[0]?.position
    if (!position) {
      return null
    }

    return {
      latitude: position.lat,
      longitude: position.lng,
    }
  } catch (error) {
    Sentry.captureException(error)
    return null
  }
}

export const navigateTo = (
  contact: Contact,
  provider: DefaultNavigationMapProvider
) => {
  const getScheme = () => {
    switch (provider) {
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
