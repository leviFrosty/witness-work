import { Alert, AppState, Platform, type AppStateStatus } from 'react-native'
import {
  checkHotUpdate,
  hasPreparedUpdate,
  hotUpdater,
  launchRead,
  otaEnabled,
  preparedUpdateId,
  reloadApp,
} from '@/lib/hotUpdater'
import { analytics } from '@/lib/analytics'
import { usePendingUpdate } from '@/features/updates/stores/pendingUpdate'
import i18n, { type TranslationKey } from '@/lib/locales'
import { errorTracking } from '@/lib/errorTracking'
import { isConnectivityError } from '@/lib/http/networkError'
import { isKnownOffline } from '@/lib/http/online'
import { onPullToRefresh } from '@/lib/pullToRefresh'
import { RootStackParamList } from '@/types/rootStack'

type UpdateCheckOutcome =
  | 'available'
  | 'up_to_date'
  | 'unavailable'
  | 'offline'
  | 'failed'
  | 'busy'
const LAUNCH_READ_TIMEOUT_MS = 10_000
const STARTUP_DELAY_MS = 3_000
const CHECK_INTERVAL_MS = 4 * 60_000

let checking = false
let downloadingSelected = false
let pendingUpdate: Awaited<ReturnType<typeof checkHotUpdate>> = null
let backgroundCheck: Promise<void> | undefined
let lastBackgroundCheckAt = 0
let reportedBackgroundFailure = false
let checksStarted = false

const wait = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms))

async function notePreparedUpdate() {
  usePendingUpdate.setState({ bundleId: await preparedUpdateId() })
}

export function checkForUpdateInBackground(): Promise<void> {
  if (backgroundCheck) return backgroundCheck
  if (!otaEnabled || checking || downloadingSelected || isKnownOffline())
    return Promise.resolve()
  lastBackgroundCheckAt = Date.now()
  backgroundCheck = (async () => {
    try {
      const update = await checkHotUpdate()
      if (update && !(await update.updateBundle()))
        throw new Error('Could not download the update in the background')
      await notePreparedUpdate()
    } catch (error) {
      if (isConnectivityError(error) || reportedBackgroundFailure) return
      reportedBackgroundFailure = true
      errorTracking.captureException(error)
    } finally {
      backgroundCheck = undefined
    }
  })()
  return backgroundCheck
}

export function startUpdateChecks() {
  if (!otaEnabled || checksStarted) return
  checksStarted = true
  onPullToRefresh(() => void checkForUpdateInBackground())

  const checkIfDue = () => {
    if (Date.now() - lastBackgroundCheckAt >= CHECK_INTERVAL_MS)
      void checkForUpdateInBackground()
  }
  let interval: ReturnType<typeof setInterval> | undefined
  const followAppState = (state: AppStateStatus) => {
    clearInterval(interval)
    interval = undefined
    if (state !== 'active') return
    checkIfDue()
    interval = setInterval(checkIfDue, CHECK_INTERVAL_MS)
  }

  void Promise.race([launchRead, wait(LAUNCH_READ_TIMEOUT_MS)])
    .then(() => wait(STARTUP_DELAY_MS))
    .then(() => {
      AppState.addEventListener('change', followAppState)
      followAppState(AppState.currentState)
    })
}

export async function downloadSelectedUpdate(): Promise<boolean> {
  downloadingSelected = true
  try {
    await backgroundCheck
    const update = pendingUpdate ?? (await checkHotUpdate())
    pendingUpdate = null
    if (update && !(await update.updateBundle()))
      throw new Error('Could not prepare update')

    await notePreparedUpdate()
    return usePendingUpdate.getState().bundleId !== null
  } finally {
    downloadingSelected = false
  }
}

export async function applyPendingUpdate() {
  analytics.capture('pending_update_applied')

  await analytics.flush()
  await reloadApp()
}

export { hotUpdater }

export const fetchUpdate = async (
  handleNavigation: (destination: keyof RootStackParamList) => void
): Promise<UpdateCheckOutcome> => {
  if (checking) return 'busy'
  if (!otaEnabled) {
    Alert.alert(i18n.t('updatesUnavailable'))

    return 'unavailable'
  }

  const offline = () => {
    Alert.alert(i18n.t('common_offlineTitle'), i18n.t('update_offline'))
    return 'offline' as const
  }
  if (isKnownOffline()) return offline()

  checking = true

  try {
    await backgroundCheck
    const update = await checkHotUpdate()
    if (update?.transitionKind === 'ADOPT_RELEASE') {
      if (!(await update.updateBundle()))
        throw new Error('Could not adopt update')
    } else if (update) {
      pendingUpdate = update
      handleNavigation('Update')

      return 'available'
    }
    if (await hasPreparedUpdate()) {
      handleNavigation('Update')
      return 'available'
    }
    Alert.alert(i18n.t('noUpdateAvailable'))

    return 'up_to_date'
  } catch (error) {
    if (isConnectivityError(error)) return offline()
    Alert.alert(
      i18n.t(
        Platform.select<TranslationKey>({
          android: 'updateViaTheStoreAndroid',
          default: 'updateViaTheStore',
        })
      ),
      i18n.t('update_error')
    )

    errorTracking.captureException(error)
    return 'failed'
  } finally {
    checking = false
  }
}
