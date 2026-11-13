import { Alert, Platform } from 'react-native'
import * as Location from 'expo-location'
import { openAppSettings } from '@/lib/openAppSettings'
import i18n from '@/lib/locales'
import { hasCapability } from '@/lib/platformCapabilities'

export const offerLocationSettings = () =>
  Alert.alert(
    i18n.t('locationSharingDisabled'),
    i18n.t('locationSettings_description'),
    [
      { text: i18n.t('cancel'), style: 'cancel' },
      {
        text: i18n.t('locationDisabled_callToAction'),
        onPress: () => void openAppSettings(),
      },
    ]
  )

export async function requestOrOfferLocationSettings(): Promise<boolean> {
  const current = await Location.getForegroundPermissionsAsync()
  if (current.granted) return true

  if (current.canAskAgain)
    return (await Location.requestForegroundPermissionsAsync()).granted
  offerLocationSettings()
  return false
}

export type LocationAccess =
  | 'granted'
  | 'ask'
  | 'askAgain'
  | 'denied'
  | 'approximate'
  | 'off'

export type LocationFix = 'prompt' | 'settings' | 'turnOn' | null

type Permission = Pick<
  Location.LocationPermissionResponse,
  'status' | 'granted' | 'canAskAgain' | 'ios' | 'android'
>

const approximateOnly = (permission: Permission) =>
  permission.ios?.accuracy === 'reduced' ||
  permission.android?.accuracy === 'coarse'

export const readLocationAccess = ({
  permission,
  servicesOn,
  promptsAfterDenial,
  precise,
}: {
  permission: Permission
  servicesOn: boolean
  promptsAfterDenial: boolean
  precise: boolean
}): LocationAccess => {
  if (!servicesOn) return 'off'
  if (permission.granted)
    return precise && approximateOnly(permission) ? 'approximate' : 'granted'
  if (permission.status === Location.PermissionStatus.UNDETERMINED)
    return permission.canAskAgain ? 'ask' : 'denied'
  return promptsAfterDenial && permission.canAskAgain ? 'askAgain' : 'denied'
}

export const locationFix = (
  access: LocationAccess | null,
  {
    settings,
    turnOn,
  }: {
    settings: boolean
    turnOn: boolean
  }
): LocationFix => {
  switch (access) {
    case 'ask':
    case 'askAgain':
      return 'prompt'
    case 'off':
      return turnOn ? 'turnOn' : settings ? 'settings' : null
    case 'denied':
    case 'approximate':
      return settings ? 'settings' : null
    default:
      return null
  }
}

export const locationShowsNotice = ({
  access,
  declined,
}: {
  access: LocationAccess | null
  declined: boolean
}) => access !== null && access !== 'granted' && (access !== 'ask' || declined)

const PROMPTS_AFTER_DENIAL = Platform.select({ web: false, default: true })

const TURNS_ON_SERVICES = Platform.select({ android: true, default: false })

export const deviceLocationFix = (access: LocationAccess | null) =>
  locationFix(access, {
    settings: hasCapability('appSettings'),
    turnOn: TURNS_ON_SERVICES,
  })

const read = async (
  permission: Promise<Permission>,
  precise: boolean
): Promise<LocationAccess> => {
  try {
    const [granted, servicesOn] = await Promise.all([
      permission,
      Location.hasServicesEnabledAsync(),
    ])
    return readLocationAccess({
      permission: granted,
      servicesOn,
      promptsAfterDenial: PROMPTS_AFTER_DENIAL,
      precise,
    })
  } catch {
    return 'denied'
  }
}

export const checkLocationAccess = ({
  precise = false,
}: { precise?: boolean } = {}) =>
  read(Location.getForegroundPermissionsAsync(), precise)

let asking: Promise<Permission> | null = null

export const askLocationAccess = ({
  precise = false,
}: { precise?: boolean } = {}) => {
  asking ??= Location.requestForegroundPermissionsAsync().finally(() => {
    asking = null
  })
  return read(asking, precise)
}

export const turnOnLocationServices = () =>
  Location.enableNetworkProviderAsync().catch(() => undefined)
