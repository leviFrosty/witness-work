import { readFileSync, globSync } from 'node:fs'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('expo', () => ({
  PermissionStatus: {
    DENIED: 'denied',
    GRANTED: 'granted',
    UNDETERMINED: 'undetermined',
  },
}))

const root = path.resolve(__dirname, '../../..')

function namesTheAppUses() {
  const names = new Set<string>()
  const files = globSync('{src,modules}/**/*.{ts,tsx}', {
    cwd: root,
    exclude: (file) => /node_modules|\.test\.|vendor[\\/]web/.test(file),
  })
  for (const file of files) {
    const source = readFileSync(path.join(root, file), 'utf8')
    if (!source.includes("from 'expo-location'")) continue

    for (const [, name] of source.matchAll(
      /\bLocation\.([a-z]\w*|[A-Z][A-Z_]+\b|[A-Z]\w*(?=\.))/g
    ))
      names.add(name)
  }
  return names
}

type PermissionState = 'granted' | 'denied' | 'prompt'
type WatchCallbacks = {
  success: PositionCallback
  error?: PositionErrorCallback | null
}

function createBrowserMock(initialState: PermissionState = 'prompt') {
  let state: PermissionState = initialState
  const changeListeners = new Set<() => void>()
  const permissionStatus = {
    get state() {
      return state
    },
    addEventListener: (_event: string, listener: () => void) => {
      changeListeners.add(listener)
    },
    removeEventListener: (_event: string, listener: () => void) => {
      changeListeners.delete(listener)
    },
  }

  let nextWatchId = 1
  const watches = new Map<number, WatchCallbacks>()
  const getCurrentPosition = vi.fn<Geolocation['getCurrentPosition']>()
  const watchPosition = vi.fn<Geolocation['watchPosition']>(
    (success, error) => {
      const id = nextWatchId++
      watches.set(id, { success, error })
      return id
    }
  )
  const clearWatch = vi.fn<Geolocation['clearWatch']>((id) => {
    watches.delete(id)
  })
  const query = vi.fn(async () => permissionStatus)

  vi.stubGlobal('navigator', {
    permissions: { query },
    geolocation: {
      getCurrentPosition,
      watchPosition,
      clearWatch,
    },
  })

  const makePosition = (
    latitude: number,
    longitude: number,
    accuracy = 15
  ): GeolocationPosition =>
    ({
      coords: {
        latitude,
        longitude,
        altitude: null,
        accuracy,
        altitudeAccuracy: null,
        heading: null,
        speed: null,
      },
      timestamp: Date.now(),
    }) as GeolocationPosition

  return {
    query,
    getCurrentPosition,
    watchPosition,
    clearWatch,
    watches,
    makePosition,
    setState(next: PermissionState) {
      state = next
      for (const listener of [...changeListeners]) listener()
    },
    emitWatchPosition(latitude: number, longitude: number, accuracy = 15) {
      const position = makePosition(latitude, longitude, accuracy)
      for (const entry of [...watches.values()]) entry.success(position)
    },
    emitWatchError(code: number, message = 'Geolocation error') {
      const error = {
        code,
        message,
        PERMISSION_DENIED: 1,
        POSITION_UNAVAILABLE: 2,
        TIMEOUT: 3,
      } as GeolocationPositionError
      for (const entry of [...watches.values()]) entry.error?.(error)
    },
  }
}

describe('web location facade', () => {
  beforeEach(async () => {
    vi.useFakeTimers()
    const webLocation = await import('@/vendor/web/location')
    webLocation.__resetWebLocationForTest()
  })

  afterEach(async () => {
    const webLocation = await import('@/vendor/web/location')
    webLocation.__resetWebLocationForTest()
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it('covers every expo-location API the app calls', async () => {
    const facade = await import('@/vendor/web/location')
    const names = namesTheAppUses()
    expect(names.size).toBeGreaterThan(5)
    for (const name of names) expect(facade).toHaveProperty(name)
  })

  it('remembers a granted session even when Safari permissions.query stays prompt', async () => {
    const browser = createBrowserMock('prompt')
    const Location = await import('@/vendor/web/location')

    await expect(
      Location.getForegroundPermissionsAsync()
    ).resolves.toMatchObject({
      status: 'undetermined',
      granted: false,
      canAskAgain: true,
    })

    const request = Location.requestForegroundPermissionsAsync()
    await vi.waitFor(() =>
      expect(browser.watchPosition).toHaveBeenCalledTimes(1)
    )
    browser.emitWatchPosition(39.1012, -84.5121)

    await expect(request).resolves.toMatchObject({
      status: 'granted',
      granted: true,
      canAskAgain: true,
    })

    await expect(
      Location.getForegroundPermissionsAsync()
    ).resolves.toMatchObject({
      status: 'granted',
      granted: true,
      canAskAgain: true,
    })

    await expect(
      Location.requestForegroundPermissionsAsync()
    ).resolves.toMatchObject({ status: 'granted', granted: true })
    expect(browser.watchPosition).toHaveBeenCalledTimes(1)
    expect(browser.getCurrentPosition).not.toHaveBeenCalled()

    const cached = await Location.getLastKnownPositionAsync({ maxAge: 60_000 })
    expect(cached?.coords).toMatchObject({
      latitude: 39.1012,
      longitude: -84.5121,
    })

    const current = await Location.getCurrentPositionAsync()
    expect(current.coords).toMatchObject({
      latitude: 39.1012,
      longitude: -84.5121,
    })
    expect(browser.getCurrentPosition).not.toHaveBeenCalled()

    vi.advanceTimersByTime(3_500)
    expect(browser.clearWatch).toHaveBeenCalledTimes(1)
  })

  it('shares the active watch across requestForegroundPermissionsAsync, watchPositionAsync, and observeUserLocation', async () => {
    const browser = createBrowserMock('prompt')
    const Location = await import('@/vendor/web/location')

    const request = Location.requestForegroundPermissionsAsync()
    await vi.waitFor(() =>
      expect(browser.watchPosition).toHaveBeenCalledTimes(1)
    )
    browser.emitWatchPosition(39.1, -84.5)
    await request

    const watchUpdates: unknown[] = []
    const sub = await Location.watchPositionAsync({}, (loc) =>
      watchUpdates.push(loc.coords)
    )
    const mapDots: unknown[] = []
    const stopMap = Location.observeUserLocation((coords) =>
      mapDots.push(coords)
    )

    expect(browser.watchPosition).toHaveBeenCalledTimes(1)
    expect(mapDots).toEqual([{ latitude: 39.1, longitude: -84.5 }])

    browser.emitWatchPosition(39.2, -84.6)
    expect(mapDots.at(-1)).toEqual({ latitude: 39.2, longitude: -84.6 })
    expect(watchUpdates.at(-1)).toMatchObject({
      latitude: 39.2,
      longitude: -84.6,
    })

    sub.remove()
    expect(browser.clearWatch).not.toHaveBeenCalled()

    stopMap()
    expect(browser.clearWatch).toHaveBeenCalledTimes(1)
    expect(mapDots.at(-1)).toBeNull()

    const mapDotsOnReturn: unknown[] = []
    const stopReturn = Location.observeUserLocation((coords) =>
      mapDotsOnReturn.push(coords)
    )
    await Promise.resolve()
    expect(browser.watchPosition).toHaveBeenCalledTimes(1)
    expect(mapDotsOnReturn).toEqual([{ latitude: 39.2, longitude: -84.6 }])
    stopReturn()
  })

  it('resumes live watching on map return when browser permissions.query reports granted', async () => {
    const browser = createBrowserMock('granted')
    const Location = await import('@/vendor/web/location')

    const dots: unknown[] = []
    const stop = Location.observeUserLocation((coords) => dots.push(coords))
    await vi.waitFor(() =>
      expect(browser.watchPosition).toHaveBeenCalledTimes(1)
    )
    browser.emitWatchPosition(40.0, -73.0)
    expect(dots).toEqual([{ latitude: 40.0, longitude: -73.0 }])
    stop()
    expect(browser.clearWatch).toHaveBeenCalledTimes(1)
  })

  it('remembers denial without re-prompting and reacts when browser permissions reset', async () => {
    const browser = createBrowserMock('prompt')
    const Location = await import('@/vendor/web/location')

    const request = Location.requestForegroundPermissionsAsync()
    await vi.waitFor(() =>
      expect(browser.watchPosition).toHaveBeenCalledTimes(1)
    )
    browser.emitWatchError(1, 'User denied Geolocation')

    await expect(request).resolves.toMatchObject({
      status: 'denied',
      granted: false,
      canAskAgain: false,
    })

    await expect(
      Location.getForegroundPermissionsAsync()
    ).resolves.toMatchObject({
      status: 'denied',
      granted: false,
      canAskAgain: false,
    })
    await expect(
      Location.requestForegroundPermissionsAsync()
    ).resolves.toMatchObject({
      status: 'denied',
      granted: false,
      canAskAgain: false,
    })
    expect(browser.watchPosition).toHaveBeenCalledTimes(1)

    browser.setState('prompt')
    await expect(
      Location.getForegroundPermissionsAsync()
    ).resolves.toMatchObject({
      status: 'undetermined',
      granted: false,
      canAskAgain: true,
    })
  })

  it('fetches a fresh fix for high-accuracy requests when no watch is running', async () => {
    const browser = createBrowserMock('granted')
    const Location = await import('@/vendor/web/location')

    browser.getCurrentPosition
      .mockImplementationOnce((success) =>
        success(browser.makePosition(39.1, -84.5))
      )
      .mockImplementationOnce((success) =>
        success(browser.makePosition(39.1005, -84.5005, 5))
      )

    await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    })
    expect(browser.getCurrentPosition).toHaveBeenCalledTimes(1)

    const high = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.High,
    })
    expect(browser.getCurrentPosition).toHaveBeenCalledTimes(2)
    expect(high.coords).toMatchObject({
      latitude: 39.1005,
      longitude: -84.5005,
    })
  })
})
