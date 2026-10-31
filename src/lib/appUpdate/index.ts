import Constants from 'expo-constants'
import apis from '@/constants/apis'
import { usePreferences } from '@/stores/preferences'
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
  // Cloud Sync's switches decide a never-chosen device's default (ADR 0030).
  // A worker from before it has none: Cloud Sync is off there.
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

/**
 * Web sign-up's switch and Turnstile's site key, read now: the sign-in screen's
 * recovery key needs the key. Null from a worker before web accounts.
 */
export const fetchWebSignupConfig = async () =>
  (await fetchAppConfig(apis.appConfig)).webSignup ?? null

/** Ww-api refused a request with 426 `upgrade_required`. */
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
