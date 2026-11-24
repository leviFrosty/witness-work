import { PermissionStatus } from 'expo'
import type * as Location from 'expo-location'

export { PermissionStatus } from 'expo'

export enum LocationAccuracy {
  Lowest = 1,
  Low = 2,
  Balanced = 3,
  High = 4,
  Highest = 5,
  BestForNavigation = 6,
}

export { LocationAccuracy as Accuracy }

type LocationLastKnownOptions = Location.LocationLastKnownOptions
type LocationObject = Location.LocationObject
type LocationOptions = Location.LocationOptions
type LocationPermissionResponse = Location.LocationPermissionResponse
type LocationProviderStatus = Location.LocationProviderStatus
type LocationSubscription = Location.LocationSubscription

type BrowserPermissionState = 'granted' | 'denied' | 'prompt'
type Coordinate = { latitude: number; longitude: number }
type WatchEntry = {
  callback: (location: LocationObject) => void
  errorHandler?: (reason: string) => void
}

const HANDOFF_MS = 3_000
const DEFAULT_FRESH_MS = 60_000
const WATCH_FRESH_MS = 10_000
const PERMISSION_DENIED_CODE = 1

let sessionPermission: 'granted' | 'denied' | null = null
let lastKnownPosition: LocationObject | null = null
let inFlightRequest: Promise<LocationPermissionResponse> | null = null
let inFlightPosition: Promise<LocationObject> | null = null

let browserWatchId: number | null = null
let handoffTimer: ReturnType<typeof setTimeout> | null = null

const watchListeners = new Set<WatchEntry>()
const positionListeners = new Set<(location: LocationObject | null) => void>()
const permissionListeners = new Set<(state: BrowserPermissionState) => void>()
const firstFixWaiters = new Set<{
  onPosition: (location: LocationObject) => void
  onError: (error: GeolocationPositionError) => void
}>()

let observedPermissionStatus: globalThis.PermissionStatus | null = null
let observedPermissionHandler: (() => void) | null = null

const permissionResponse = (
  status: PermissionStatus,
  canAskAgain: boolean
): LocationPermissionResponse => ({
  status,
  granted: status === PermissionStatus.GRANTED,
  canAskAgain,
  expires: 'never',
})

const toLocationObject = (position: GeolocationPosition): LocationObject => {
  const { coords, timestamp } = position
  return {
    coords: {
      latitude: coords.latitude,
      longitude: coords.longitude,
      altitude: coords.altitude,
      accuracy: coords.accuracy,
      altitudeAccuracy: coords.altitudeAccuracy,
      heading: coords.heading,
      speed: coords.speed,
    },
    timestamp,
  }
}

const isLocationValid = (
  location: LocationObject,
  options: LocationLastKnownOptions
): boolean => {
  const maxAge = typeof options.maxAge === 'number' ? options.maxAge : Infinity
  const requiredAccuracy =
    typeof options.requiredAccuracy === 'number'
      ? options.requiredAccuracy
      : Infinity
  const accuracy = location.coords.accuracy ?? Infinity
  return (
    Date.now() - location.timestamp <= maxAge && accuracy <= requiredAccuracy
  )
}

const notifyPosition = (location: LocationObject | null) => {
  for (const listener of [...positionListeners]) listener(location)
}

const notifyPermission = (state: BrowserPermissionState) => {
  for (const listener of [...permissionListeners]) listener(state)
}

const clearHandoff = () => {
  if (handoffTimer !== null) {
    clearTimeout(handoffTimer)
    handoffTimer = null
  }
}

const stopBrowserWatch = () => {
  clearHandoff()
  if (browserWatchId !== null && typeof navigator !== 'undefined') {
    navigator.geolocation?.clearWatch(browserWatchId)
  }
  browserWatchId = null
}

const maybeStopBrowserWatch = () => {
  if (
    watchListeners.size === 0 &&
    firstFixWaiters.size === 0 &&
    handoffTimer === null
  ) {
    stopBrowserWatch()
  }
}

const scheduleHandoffCleanup = () => {
  clearHandoff()
  if (watchListeners.size > 0) return
  handoffTimer = setTimeout(() => {
    handoffTimer = null
    maybeStopBrowserWatch()
  }, HANDOFF_MS)
}

const recordPosition = (position: GeolocationPosition): LocationObject => {
  const location = toLocationObject(position)
  lastKnownPosition = location
  sessionPermission = 'granted'
  notifyPosition(location)
  return location
}

const recordDenied = () => {
  sessionPermission = 'denied'
  lastKnownPosition = null
  stopBrowserWatch()
  notifyPosition(null)
  notifyPermission('denied')
}

const ensureBrowserWatch = () => {
  if (
    browserWatchId !== null ||
    typeof navigator === 'undefined' ||
    !navigator.geolocation?.watchPosition
  ) {
    return
  }
  browserWatchId = navigator.geolocation.watchPosition(
    (position) => {
      const location = recordPosition(position)
      for (const entry of [...watchListeners]) entry.callback(location)
      for (const waiter of [...firstFixWaiters]) {
        firstFixWaiters.delete(waiter)
        waiter.onPosition(location)
      }
    },
    (error) => {
      if (error.code === PERMISSION_DENIED_CODE) {
        recordDenied()
      }
      for (const entry of [...watchListeners]) {
        entry.errorHandler?.(error.message)
      }
      for (const waiter of [...firstFixWaiters]) {
        firstFixWaiters.delete(waiter)
        waiter.onError(error)
      }
      if (error.code !== PERMISSION_DENIED_CODE) {
        maybeStopBrowserWatch()
      }
    },
    { enableHighAccuracy: true, maximumAge: DEFAULT_FRESH_MS }
  )
}

async function queryBrowserPermission(): Promise<BrowserPermissionState | null> {
  if (typeof navigator === 'undefined' || !navigator.permissions?.query) {
    return null
  }
  try {
    const status = await navigator.permissions.query({ name: 'geolocation' })
    if (observedPermissionStatus !== status) {
      if (observedPermissionStatus && observedPermissionHandler) {
        observedPermissionStatus.removeEventListener(
          'change',
          observedPermissionHandler
        )
      }
      observedPermissionStatus = status
      observedPermissionHandler = () => {
        if (status.state === 'granted') {
          sessionPermission = 'granted'
          notifyPermission('granted')
        } else if (status.state === 'denied') {
          recordDenied()
        } else {
          sessionPermission = null
          lastKnownPosition = null
          stopBrowserWatch()
          notifyPosition(null)
          notifyPermission('prompt')
        }
      }
      status.addEventListener?.('change', observedPermissionHandler)
    }
    if (status.state === 'granted') {
      sessionPermission = 'granted'
      return 'granted'
    }
    if (status.state === 'denied') {
      sessionPermission = 'denied'
      return 'denied'
    }
    return 'prompt'
  } catch {
    return null
  }
}

export async function getForegroundPermissionsAsync(): Promise<LocationPermissionResponse> {
  const browserState = await queryBrowserPermission()
  if (browserState === 'granted') {
    return permissionResponse(PermissionStatus.GRANTED, true)
  }
  if (browserState === 'denied') {
    return permissionResponse(PermissionStatus.DENIED, false)
  }
  if (sessionPermission === 'granted') {
    return permissionResponse(PermissionStatus.GRANTED, true)
  }
  if (sessionPermission === 'denied') {
    return permissionResponse(PermissionStatus.DENIED, false)
  }
  return permissionResponse(PermissionStatus.UNDETERMINED, true)
}

export async function requestForegroundPermissionsAsync(): Promise<LocationPermissionResponse> {
  if (inFlightRequest) return inFlightRequest

  const run = (async (): Promise<LocationPermissionResponse> => {
    const current = await getForegroundPermissionsAsync()
    if (current.granted) return current
    if (current.status === PermissionStatus.DENIED && !current.canAskAgain) {
      return current
    }
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      return permissionResponse(PermissionStatus.DENIED, false)
    }

    if (typeof navigator.geolocation.watchPosition === 'function') {
      return new Promise<LocationPermissionResponse>((resolve) => {
        const waiter = {
          onPosition: () => {
            scheduleHandoffCleanup()
            resolve(permissionResponse(PermissionStatus.GRANTED, true))
          },
          onError: (error: GeolocationPositionError) => {
            if (error.code === PERMISSION_DENIED_CODE) {
              resolve(permissionResponse(PermissionStatus.DENIED, false))
              return
            }
            resolve(permissionResponse(PermissionStatus.UNDETERMINED, true))
          },
        }
        firstFixWaiters.add(waiter)
        ensureBrowserWatch()
      })
    }

    return new Promise<LocationPermissionResponse>((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          recordPosition(position)
          resolve(permissionResponse(PermissionStatus.GRANTED, true))
        },
        (error) => {
          if (error.code === PERMISSION_DENIED_CODE) {
            recordDenied()
            resolve(permissionResponse(PermissionStatus.DENIED, false))
            return
          }
          resolve(permissionResponse(PermissionStatus.UNDETERMINED, true))
        },
        { maximumAge: DEFAULT_FRESH_MS }
      )
    })
  })().finally(() => {
    inFlightRequest = null
  })

  inFlightRequest = run
  return run
}

export async function getBackgroundPermissionsAsync(): Promise<LocationPermissionResponse> {
  return getForegroundPermissionsAsync()
}

export async function requestBackgroundPermissionsAsync(): Promise<LocationPermissionResponse> {
  return requestForegroundPermissionsAsync()
}

export async function hasServicesEnabledAsync(): Promise<boolean> {
  return typeof navigator !== 'undefined' && 'geolocation' in navigator
}

export async function getProviderStatusAsync(): Promise<LocationProviderStatus> {
  return {
    locationServicesEnabled: await hasServicesEnabledAsync(),
    backgroundModeEnabled: false,
  }
}

export async function enableNetworkProviderAsync(): Promise<void> {}

export async function getLastKnownPositionAsync(
  options: LocationLastKnownOptions = {}
): Promise<LocationObject | null> {
  if (lastKnownPosition && isLocationValid(lastKnownPosition, options)) {
    return lastKnownPosition
  }
  return null
}

export async function getCurrentPositionAsync(
  options: LocationOptions = {}
): Promise<LocationObject> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    throw new Error('Location services are disabled')
  }

  const wantsHighAccuracy =
    (options.accuracy ?? LocationAccuracy.Balanced) >= LocationAccuracy.High

  if (lastKnownPosition) {
    const age = Date.now() - lastKnownPosition.timestamp
    if (
      (!wantsHighAccuracy && age <= DEFAULT_FRESH_MS) ||
      (browserWatchId !== null && age <= WATCH_FRESH_MS)
    ) {
      return lastKnownPosition
    }
  }

  if (inFlightPosition) return inFlightPosition

  const run = new Promise<LocationObject>((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve(recordPosition(position))
      },
      (error) => {
        if (error.code === PERMISSION_DENIED_CODE) {
          recordDenied()
        }
        reject(error)
      },
      {
        maximumAge: wantsHighAccuracy ? 0 : DEFAULT_FRESH_MS,
        enableHighAccuracy: wantsHighAccuracy,
      }
    )
  }).finally(() => {
    inFlightPosition = null
  })

  inFlightPosition = run
  return run
}

export async function watchPositionAsync(
  _options: LocationOptions,
  callback: (location: LocationObject) => void,
  errorHandler?: (reason: string) => void
): Promise<LocationSubscription> {
  let active = true
  const entry: WatchEntry = { callback, errorHandler }
  clearHandoff()
  watchListeners.add(entry)
  ensureBrowserWatch()

  if (
    lastKnownPosition &&
    Date.now() - lastKnownPosition.timestamp <= DEFAULT_FRESH_MS
  ) {
    const snapshot = lastKnownPosition
    queueMicrotask(() => {
      if (active) callback(snapshot)
    })
  }

  return {
    remove() {
      if (!active) return
      active = false
      watchListeners.delete(entry)
      maybeStopBrowserWatch()
    },
  }
}

export async function geocodeAsync(): Promise<
  Location.LocationGeocodedLocation[]
> {
  return []
}

export async function reverseGeocodeAsync(): Promise<
  Location.LocationGeocodedAddress[]
> {
  return []
}

export function observeUserLocation(
  onLocation: (location: Coordinate | null) => void
): () => void {
  let cancelled = false
  let liveEntry: WatchEntry | null = null

  const emit = (location: LocationObject | null) => {
    if (cancelled) return
    onLocation(
      location
        ? {
            latitude: location.coords.latitude,
            longitude: location.coords.longitude,
          }
        : null
    )
  }

  const startLive = () => {
    if (cancelled || liveEntry) return
    clearHandoff()
    liveEntry = { callback: () => {} }
    watchListeners.add(liveEntry)
    ensureBrowserWatch()
  }

  const stopLive = () => {
    if (!liveEntry) return
    watchListeners.delete(liveEntry)
    liveEntry = null
    maybeStopBrowserWatch()
  }

  positionListeners.add(emit)
  if (lastKnownPosition) emit(lastKnownPosition)

  const onPermissionChange = (state: BrowserPermissionState) => {
    if (cancelled) return
    if (state === 'granted') {
      startLive()
    } else if (state === 'denied') {
      stopLive()
      onLocation(null)
    }
  }
  permissionListeners.add(onPermissionChange)

  if (browserWatchId !== null) {
    startLive()
  } else {
    void queryBrowserPermission().then((state) => {
      if (cancelled) return
      if (state === 'granted') startLive()
    })
  }

  return () => {
    cancelled = true
    positionListeners.delete(emit)
    permissionListeners.delete(onPermissionChange)
    stopLive()
    onLocation(null)
  }
}

export function __resetWebLocationForTest() {
  stopBrowserWatch()
  watchListeners.clear()
  positionListeners.clear()
  permissionListeners.clear()
  firstFixWaiters.clear()
  if (observedPermissionStatus && observedPermissionHandler) {
    observedPermissionStatus.removeEventListener?.(
      'change',
      observedPermissionHandler
    )
  }
  observedPermissionStatus = null
  observedPermissionHandler = null
  sessionPermission = null
  lastKnownPosition = null
  inFlightRequest = null
  inFlightPosition = null
}

const facade = {
  PermissionStatus,
  Accuracy: LocationAccuracy as unknown as typeof Location.Accuracy,
  getForegroundPermissionsAsync,
  requestForegroundPermissionsAsync,
  getBackgroundPermissionsAsync,
  requestBackgroundPermissionsAsync,
  hasServicesEnabledAsync,
  getProviderStatusAsync,
  enableNetworkProviderAsync,
  getLastKnownPositionAsync,
  getCurrentPositionAsync,
  watchPositionAsync,
  geocodeAsync,
  reverseGeocodeAsync,
} satisfies Partial<typeof Location>

export default facade
