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
/**
 * Settles once Hot Updater has read this launch, a frame or more after the
 * first render. On the first launch of a freshly applied update that waits for
 * native to verify it: Android verifies on React Native's first-content signal,
 * and an update whose process dies before that is rolled back as a crash. A
 * reload that can't wait for verification (the launch layout-direction reload)
 * waits for this. Never settles if the SDK fails to read the launch.
 */
export const launchRead = new Promise<void>((resolve) => {
  markLaunchRead = resolve
})

// One instance owns native startup verification, checks and Insights reports.
export const hotUpdater = HotUpdater.init({
  baseURL: config.baseURL,
  requestHeaders: { 'x-api-key': config.apiKey ?? '' },
  plugins: otaEnabled ? [insights()] : [],
  // Called once the launch is no longer pending verification.
  onNotifyAppReady: () => markLaunchRead(),
  onError: (error) => {
    if (!isConnectivityError(error))
      errorTracking.captureException(error, { area: 'ota' })
  },
})
// Android's launch verifier needs a fresh Activity/process to observe the
// first-content signal. An in-process reload can leave a valid update pending
// and cause recovery to discard it on the next launch.
hotUpdater.setReloadBehavior(
  Platform.OS === 'android' ? 'processRestart' : 'reload'
)

// getBundleId() follows the selected update, including one staged after this
// JS launch. Capture the running artifact before any check changes selection.
const launchedSelection = hotUpdater.getActiveUpdateState()

/**
 * The artifact the next launch runs (`builtin` for a rollback to the binary's
 * own bundle) when it isn't the one running now, else null.
 */
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
    // The SDK reports check errors and returns null. Preserve the distinction
    // between a failed check and an empty catalog for our existing update UI.
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
