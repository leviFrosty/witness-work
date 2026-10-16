import Constants from 'expo-constants'
import apis from '@/constants/apis'
import {
  createAppConfigCheck,
  fetchAppConfig,
  requireUpdateFromServer,
} from '@/lib/appUpdate/updateRequired'

/** The running app's `app.config.ts` version. */
export const appVersion = (): string | null =>
  Constants.expoConfig?.version ?? null

/** At launch and on returning to the foreground; at most once a minute. */
export const checkAppConfig = createAppConfigCheck({
  fetchConfig: () => fetchAppConfig(apis.appConfig),
  currentVersion: appVersion,
  now: Date.now,
})

/** Ww-api refused a request with 426 `upgrade_required`. */
export const updateRequiredByServer = () =>
  requireUpdateFromServer(appVersion())

export {
  APP_CONFIG_MIN_INTERVAL_MS,
  useUpdateRequired,
} from '@/lib/appUpdate/updateRequired'
export type {
  UpdateRequired,
  UpdateRequiredSource,
} from '@/lib/appUpdate/updateRequired'
