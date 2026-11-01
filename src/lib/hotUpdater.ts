import { HotUpdater, insights } from '@hot-updater/react-native'
import Constants from 'expo-constants'
import { DevSettings, Platform } from 'react-native'
import { errorTracking } from '@/lib/errorTracking'
import { isConnectivityError } from '@/lib/http/networkError'

const config = Constants.expoConfig?.extra?.hotUpdater
export const otaEnabled = !__DEV__ && process.env.EXPO_PUBLIC_PERF_PROBE !== '1'
if (!config?.baseURL || (otaEnabled && !config?.apiKey))
  throw new Error('Missing Hot Updater build configuration')

let markLaunchRead = () => {}

export const launchRead = new Promise<void>((resolve) => {
  markLaunchRead = resolve
})

export const hotUpdater = HotUpdater.init({
  baseURL: config.baseURL,
  requestHeaders: { 'x-api-key': config.apiKey ?? '' },
  plugins: otaEnabled ? [insights()] : [],

  onNotifyAppReady: () => markLaunchRead(),
  onError: (error) => {
    if (!isConnectivityError(error))
      errorTracking.captureException(error, { area: 'ota' })
  },
})

hotUpdater.setReloadBehavior(
  Platform.OS === 'android' ? 'processRestart' : 'reload'
)

const launchedSelection = hotUpdater.getActiveUpdateState()

export async function preparedUpdateId(): Promise<string | null> {
  const [launched, selected] = await Promise.all([
    launchedSelection,
    hotUpdater.getActiveUpdateState(),
  ])
  const next = selected.activeSelection?.bundleId
  if (launched.activeSelection?.bundleId === next) return null
  return next ?? 'builtin'
}

export async function hasPreparedUpdate() {
  return (await preparedUpdateId()) !== null
}

export async function checkHotUpdate() {
  let checkError: unknown
  const update = await hotUpdater.checkForUpdate({
    updateStrategy: 'fingerprint',

    onError: (error) => {
      checkError = error
    },
  })
  if (checkError) throw checkError
  return update
}

export async function reloadApp() {
  if (__DEV__) DevSettings.reload()
  else await hotUpdater.reload()
}
