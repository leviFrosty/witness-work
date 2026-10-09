import { perf } from '@/lib/perf'
import { useEffect, useState } from 'react'
import { AppState } from 'react-native'
import { useNetworkState } from 'expo-network'
import { create } from 'zustand'
import {
  PostHogPersistedProperty,
  QuotaLimitedFeature,
  type PostHogFlagsStorageFormat,
} from '@posthog/core'
import { posthogClient } from '@/lib/posthogClient'
import { analyticsEventAllowed } from '@/lib/analyticsPolicy'
import { logger } from '@/lib/logger'
import { usePreferences } from '@/stores/preferences'

// Add future flag keys to this union so call sites stay type-checked.
export type FeatureFlag = 'notes-import' | 'notes-import-android' | 'buddies'
type FlagValues = Partial<Record<FeatureFlag, boolean | string>>

/**
 * Where flag values stand: `loading` until a load settles (including while the
 * network state is still unknown), `loaded` with values for the current
 * identity, `failed` with every flag closed, or not attempted because the app
 * isn't active (`idle`) or is `offline`. Only `loaded` carries values.
 */
export type FeatureFlagsStatus =
  | 'idle'
  | 'offline'
  | 'loading'
  | 'loaded'
  | 'failed'

/** Dev builds, and profiling builds (scripts/perf), which force Buddies on. */
const overridesAllowed = () =>
  __DEV__ || process.env.EXPO_PUBLIC_PERF_PROBE === '1'

const useFlags = create<{
  values: FlagValues
  distinctId?: string
  status: FeatureFlagsStatus
  /** Dev and profiling builds only (harnesses); survive remote refreshes. */
  devOverrides: FlagValues
}>(() => ({
  values: {},
  status: 'idle',
  devOverrides: {},
}))

/** Dev and profiling builds only: force a flag on/off, or undefined to clear. */
export function setDevFlagOverride(
  flag: FeatureFlag,
  value: boolean | string | undefined
): void {
  if (!overridesAllowed()) return
  useFlags.setState(({ devOverrides }) => ({
    devOverrides: { ...devOverrides, [flag]: value },
  }))
}

const clearFlags = (status: FeatureFlagsStatus) =>
  useFlags.setState({ values: {}, distinctId: undefined, status })

function publishLoadedFlags(): void {
  const details =
    posthogClient?.getPersistedProperty<PostHogFlagsStorageFormat>(
      PostHogPersistedProperty.FeatureFlagDetails
    )
  // The SDK retains cached values on failure/quota errors. They must not reopen
  // features or produce exposures after a failed refresh or identity reset.
  if (
    !details ||
    details.requestError ||
    details.errorsWhileComputingFlags ||
    details.quotaLimited?.includes(QuotaLimitedFeature.FeatureFlags)
  ) {
    clearFlags('failed')
    return
  }
  // An SDK request already in flight at reset can publish its previous
  // assignment briefly, until the SDK's queued reload for the new identity finishes.
  useFlags.setState({
    values: posthogClient?.getFeatureFlags() ?? {},
    distinctId: posthogClient?.getDistinctId(),
    status: 'loaded',
  })
}

/** Mount once at the app root. Values are never restored from the SDK cache. */
export function useInitializeFeatureFlags(): void {
  const { isConnected, isInternetReachable } = useNetworkState()
  const [appState, setAppState] = useState(AppState.currentState)

  useEffect(() => {
    const subscription = AppState.addEventListener('change', setAppState)
    return () => subscription.remove()
  }, [])

  useEffect(() => {
    if (appState !== 'active' || !isConnected || !isInternetReachable) {
      // A network state that's still unknown counts as loading; this runs
      // again once it arrives.
      clearFlags(
        appState !== 'active'
          ? 'idle'
          : isConnected === false || isInternetReachable === false
            ? 'offline'
            : 'loading'
      )
      return
    }
    clearFlags('loading')

    let cancelled = false
    const unsubscribeFlags = posthogClient?.on(
      'featureflags',
      publishLoadedFlags
    )
    const unsubscribePreferences = usePreferences.subscribe(
      (state, previous) => {
        // Consent withdrawal resets the SDK identity synchronously, even if React
        // batches a rapid off/on into one render. Its reload will publish new flags.
        if (previous.analyticsEnabled && !state.analyticsEnabled)
          clearFlags('loading')
      }
    )
    async function load() {
      try {
        perf.count('flags:reload')
        const values = await posthogClient?.reloadFeatureFlagsAsync()
        if (!cancelled && values === undefined) clearFlags('failed')
      } catch {
        if (!cancelled) clearFlags('failed')
        // Loading and provider failures leave every flag closed.
      }
    }
    void load()
    return () => {
      cancelled = true
      unsubscribeFlags?.()
      unsubscribePreferences()
      clearFlags('idle')
    }
  }, [appState, isConnected, isInternetReachable])
}

/** Read at the experience boundary, including multivariate experiment values. */
export function useFeatureFlagValue(
  flag: FeatureFlag
): boolean | string | undefined {
  const value = useFlags((state) => state.values[flag])
  const distinctId = useFlags((state) => state.distinctId)
  const devOverride = useFlags((state) => state.devOverrides[flag])
  const currentValue =
    distinctId !== undefined && distinctId === posthogClient?.getDistinctId()
      ? value
      : undefined
  const analyticsEnabled = usePreferences((state) => state.analyticsEnabled)
  useEffect(() => {
    if (
      currentValue === undefined ||
      !analyticsEnabled ||
      !analyticsEventAllowed('$feature_flag_called')
    )
      return
    try {
      // SDK reads preserve experiment metadata and deduplicate each flag/value.
      // Fetching the flags alone never records exposure.
      if (
        !posthogClient ||
        posthogClient.getDistinctId() !== distinctId ||
        posthogClient.getFeatureFlag(flag, { sendEvent: false }) !==
          currentValue
      )
        return
      posthogClient.getFeatureFlag(flag)
    } catch {
      logger.debug('[Analytics] Feature flag exposure unavailable')
    }
  }, [flag, currentValue, distinctId, analyticsEnabled])
  if (devOverride !== undefined && overridesAllowed()) return devOverride
  return currentValue
}

/**
 * Whether flag values are loading or have settled. `loaded` only once values
 * for the current identity are in, matching what `useFeatureFlagValue` reads.
 */
export function useFeatureFlagsStatus(): FeatureFlagsStatus {
  const status = useFlags((state) => state.status)
  const distinctId = useFlags((state) => state.distinctId)
  if (status === 'loaded' && distinctId !== posthogClient?.getDistinctId())
    return 'loading'
  return status
}

/** UI visibility only; access control belongs on the server. */
export function useFeatureFlag(flag: FeatureFlag): boolean {
  return useFeatureFlagValue(flag) === true
}
