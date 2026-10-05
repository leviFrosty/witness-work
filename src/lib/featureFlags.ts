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
export type FeatureFlag = 'notes-import' | 'buddies'
type FlagValues = Partial<Record<FeatureFlag, boolean | string>>
const useFlags = create<{ values: FlagValues; distinctId?: string }>(() => ({
  values: {},
}))

const clearFlags = () =>
  useFlags.setState({ values: {}, distinctId: undefined })

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
    clearFlags()
    return
  }
  // An SDK request already in flight at reset can publish its previous
  // assignment briefly, until the SDK's queued reload for the new identity finishes.
  useFlags.setState({
    values: posthogClient?.getFeatureFlags() ?? {},
    distinctId: posthogClient?.getDistinctId(),
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
    clearFlags()
    if (appState !== 'active' || !isConnected || !isInternetReachable) return

    let cancelled = false
    const unsubscribeFlags = posthogClient?.on(
      'featureflags',
      publishLoadedFlags
    )
    const unsubscribePreferences = usePreferences.subscribe(
      (state, previous) => {
        // Consent withdrawal resets the SDK identity synchronously, even if React
        // batches a rapid off/on into one render. Its reload will publish new flags.
        if (previous.analyticsEnabled && !state.analyticsEnabled) clearFlags()
      }
    )
    async function load() {
      try {
        const values = await posthogClient?.reloadFeatureFlagsAsync()
        if (!cancelled && values === undefined) clearFlags()
      } catch {
        if (!cancelled) clearFlags()
        // Loading and provider failures leave every flag closed.
      }
    }
    void load()
    return () => {
      cancelled = true
      unsubscribeFlags?.()
      unsubscribePreferences()
      clearFlags()
    }
  }, [appState, isConnected, isInternetReachable])
}

/** Read at the experience boundary, including multivariate experiment values. */
export function useFeatureFlagValue(
  flag: FeatureFlag
): boolean | string | undefined {
  const value = useFlags((state) => state.values[flag])
  const distinctId = useFlags((state) => state.distinctId)
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
  return currentValue
}

/** UI visibility only; access control belongs on the server. */
export function useFeatureFlag(flag: FeatureFlag): boolean {
  return useFeatureFlagValue(flag) === true
}
