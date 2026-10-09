import { perf } from '@/lib/perf'
import { useEffect } from 'react'
import { AppState } from 'react-native'
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
import { addForegroundListener } from '@/lib/appLifecycle'
import { getOnline, useOnline } from '@/lib/http/online'

// Add future flag keys to this union so call sites stay type-checked.
export type FeatureFlag = 'notes-import' | 'notes-import-android' | 'buddies'
type FlagValues = Partial<Record<FeatureFlag, boolean | string>>

/**
 * Where flag values stand: `loading` until a load settles (including while the
 * network state is still unknown), `loaded` with values for the current
 * identity, `failed` with every flag closed, or not attempted yet because the
 * app isn't active (`idle`) or is `offline`. Only `loaded` carries values, and
 * it stays loaded through backgrounding, going offline and failed reloads.
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

/** A return to the app reloads flags at most this often. */
export const FLAG_RELOAD_INTERVAL_MS = 10 * 60_000

const clearFlags = (status: FeatureFlagsStatus) =>
  useFlags.setState({ values: {}, distinctId: undefined, status })

/** Values loaded for the identity the SDK has now. */
function hasCurrentValues(): boolean {
  const { status, distinctId } = useFlags.getState()
  return status === 'loaded' && distinctId === posthogClient?.getDistinctId()
}

/** When values last loaded; 0 until they have, or after a load failed. */
let loadedAt = 0
let loading = false

/**
 * A reload that couldn't reach PostHog keeps what loaded for this identity,
 * like being offline does. With nothing loaded, every flag stays closed.
 */
function settleFailedLoad(): void {
  loadedAt = 0
  if (!hasCurrentValues()) clearFlags('failed')
}

/** Before any values loaded: not tried while backgrounded or offline. */
function settleWaiting(): void {
  if (hasCurrentValues() || loading) return
  const status = useFlags.getState().status
  if (status === 'failed') return
  const next: FeatureFlagsStatus =
    AppState.currentState !== 'active'
      ? 'idle'
      : getOnline() === false
        ? 'offline'
        : 'loading'
  if (status !== next) clearFlags(next)
}

function publishLoadedFlags(): void {
  const details =
    posthogClient?.getPersistedProperty<PostHogFlagsStorageFormat>(
      PostHogPersistedProperty.FeatureFlagDetails
    )
  if (details?.requestError) {
    settleFailedLoad()
    return
  }
  // The SDK retains cached values on quota errors and partial results. They
  // must not reopen features or produce exposures.
  if (
    !details ||
    details.errorsWhileComputingFlags ||
    details.quotaLimited?.includes(QuotaLimitedFeature.FeatureFlags)
  ) {
    loadedAt = 0
    clearFlags('failed')
    return
  }
  // An SDK request already in flight at reset can publish its previous
  // assignment briefly, until the SDK's queued reload for the new identity finishes.
  loadedAt = Date.now()
  useFlags.setState({
    values: posthogClient?.getFeatureFlags() ?? {},
    distinctId: posthogClient?.getDistinctId(),
    status: 'loaded',
  })
}

async function load(): Promise<void> {
  if (loading) return
  loading = true
  if (!hasCurrentValues()) clearFlags('loading')
  try {
    perf.count('flags:reload')
    const values = await posthogClient?.reloadFeatureFlagsAsync()
    // Loading and provider failures leave every flag closed, unless values
    // for this identity already loaded.
    if (values === undefined) settleFailedLoad()
  } catch {
    settleFailedLoad()
  } finally {
    loading = false
  }
}

/** Loads when the app is active and online, unless values are fresh enough. */
function loadIfDue(minAgeMs: number): void {
  if (AppState.currentState !== 'active' || getOnline() !== true) {
    settleWaiting()
    return
  }
  if (loadedAt && Date.now() - loadedAt < minAgeMs) return
  void load()
}

/**
 * Loads flags and keeps them current: once the app is active and online, then
 * on a return to the app at most every `FLAG_RELOAD_INTERVAL_MS`, and on
 * reconnecting until a load works. Values are never restored from the SDK
 * cache. Mount once, through `FeatureFlagsRuntime`.
 */
export function useInitializeFeatureFlags(): void {
  const online = useOnline()

  useEffect(() => {
    const unsubscribeFlags = posthogClient?.on(
      'featureflags',
      publishLoadedFlags
    )
    const unsubscribePreferences = usePreferences.subscribe(
      (state, previous) => {
        // Consent withdrawal resets the SDK identity synchronously, even if React
        // batches a rapid off/on into one render. Its reload will publish new flags.
        if (previous.analyticsEnabled && !state.analyticsEnabled) {
          loadedAt = 0
          clearFlags('loading')
        }
      }
    )
    const foreground = addForegroundListener(() =>
      loadIfDue(FLAG_RELOAD_INTERVAL_MS)
    )
    // Launched in the background (a push or background task): load once the
    // app is in use. Brief `inactive` blips don't reload loaded values.
    const active = AppState.addEventListener('change', (state) => {
      if (state === 'active' && !loadedAt) loadIfDue(0)
    })
    return () => {
      unsubscribeFlags?.()
      unsubscribePreferences()
      foreground.remove()
      active.remove()
    }
  }, [])

  // At launch, and on reconnecting until a load works.
  useEffect(() => {
    if (!loadedAt) loadIfDue(0)
    else settleWaiting()
  }, [online])
}

/**
 * Keeps feature flags loaded. A leaf, so network and app-state changes
 * re-render only this, not the app.
 */
export function FeatureFlagsRuntime(): null {
  useInitializeFeatureFlags()
  return null
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
