import Constants from 'expo-constants'
import apis from '@/constants/apis'
import { usePreferences } from '@/stores/preferences'
import { readLaunchAppConfig } from '@/lib/appUpdate/launchConfig'
import {
  createAppConfigCheck,
  fetchAppConfig,
  requireUpdateFromServer,
} from '@/lib/appUpdate/updateRequired'

export const appVersion = (): string | null =>
  Constants.expoConfig?.version ?? null

let launchConfigRead = false

export const checkAppConfig = createAppConfigCheck({
  fetchConfig: () => {
    if (launchConfigRead) return fetchAppConfig(apis.appConfig)
    launchConfigRead = true
    return readLaunchAppConfig()
  },
  currentVersion: appVersion,
  now: Date.now,

  onConfig: ({ sync: read }) => {
    const sync = read ?? { enabled: false, entitlement: 'supporter' as const }
    const current = usePreferences.getState().cloudSyncConfig
    if (
      current?.enabled !== sync?.enabled ||
      current?.entitlement !== sync?.entitlement
    )
      usePreferences.setState({ cloudSyncConfig: sync })
  },
})

export const fetchWebSignupConfig = async () =>
  (await fetchAppConfig(apis.appConfig)).webSignup ?? null

export const updateRequiredByServer = () =>
  requireUpdateFromServer(appVersion())

export {
  APP_CONFIG_MIN_INTERVAL_MS,
  useUpdateRequired,
} from '@/lib/appUpdate/updateRequired'
export type {
  AppWebSignupConfig,
  UpdateRequired,
  UpdateRequiredSource,
} from '@/lib/appUpdate/updateRequired'
