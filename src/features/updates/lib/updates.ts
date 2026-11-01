import { Alert, Platform } from 'react-native'
import {
  checkHotUpdate,
  hasPreparedUpdate,
  hotUpdater,
  otaEnabled,
  preparedUpdateId,
  reloadApp,
} from '@/lib/hotUpdater'
import { analytics } from '@/lib/analytics'
import { usePendingUpdate } from '@/features/updates/stores/pendingUpdate'
import i18n from '@/lib/locales'
import { errorTracking } from '@/lib/errorTracking'
import { isConnectivityError } from '@/lib/http/networkError'
import { isKnownOffline } from '@/lib/http/online'
import { RootStackParamList } from '@/types/rootStack'

type UpdateCheckOutcome =
  | 'available'
  | 'up_to_date'
  | 'unavailable'
  | 'offline'
  | 'failed'
  | 'busy'
let checking = false
let pendingUpdate: Awaited<ReturnType<typeof checkHotUpdate>> = null
let startupDownload: Promise<void> | undefined

async function notePreparedUpdate() {
  usePendingUpdate.setState({ bundleId: await preparedUpdateId() })
}

export function downloadUpdateOnLaunch(): Promise<void> {
  if (!otaEnabled || startupDownload)
    return startupDownload ?? Promise.resolve()
  startupDownload = (async () => {
    try {
      const update = await checkHotUpdate()
      if (update && !(await update.updateBundle()))
        throw new Error('Could not download the startup update')
      await notePreparedUpdate()
    } catch (error) {
      if (!isConnectivityError(error)) errorTracking.captureException(error)
    }
  })()
  return startupDownload
}

export async function downloadSelectedUpdate(): Promise<boolean> {
  await startupDownload
  const update = pendingUpdate ?? (await checkHotUpdate())
  pendingUpdate = null
  if (update && !(await update.updateBundle()))
    throw new Error('Could not prepare update')

  await notePreparedUpdate()
  return usePendingUpdate.getState().bundleId !== null
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
    await startupDownload
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
        Platform.OS === 'android'
          ? 'updateViaTheStoreAndroid'
          : 'updateViaTheStore'
      ),
      i18n.t('update_error')
    )

    errorTracking.captureException(error)
    return 'failed'
  } finally {
    checking = false
  }
}
