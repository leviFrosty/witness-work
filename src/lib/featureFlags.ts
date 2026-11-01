import { perf } from '@/lib/perf'
import { useEffect } from 'react'
import { AppState } from 'react-native'
import { create } from 'zustand'
import {
  PostHogPersistedProperty,
  QuotaLimitedFeature,
  type JsonType,
  type PostHogFlagsStorageFormat,
} from '@posthog/core'
import { posthogClient } from '@/lib/posthogClient'
import { analyticsEventAllowed } from '@/lib/analyticsPolicy'
import { logger } from '@/lib/logger'
import { usePreferences } from '@/stores/preferences'
import { addForegroundListener } from '@/lib/appLifecycle'
import { getOnline, useOnline } from '@/lib/http/online'

export type FeatureFlag =
  | 'buddies'
  | 'announcement'
  | 'scribe-ai'
  | 'shared-cars'
type FlagValues = Partial<Record<FeatureFlag, boolean | string>>
type FlagPayloads = Partial<Record<FeatureFlag, JsonType>>

export type FeatureFlagsStatus =
  | 'idle'
  | 'offline'
  | 'loading'
  | 'loaded'
  | 'failed'

const overridesAllowed = () =>
  __DEV__ || process.env.EXPO_PUBLIC_PERF_PROBE === '1'

const useFlags = create<{
  values: FlagValues

  payloads: FlagPayloads
  distinctId?: string
  status: FeatureFlagsStatus

  devOverrides: FlagValues
  devPayloadOverrides: FlagPayloads
}>(() => ({
  values: {},
  payloads: {},
  status: 'idle',
  devOverrides: {},
  devPayloadOverrides: {},
}))

export function setDevFlagOverride(
  flag: FeatureFlag,
  value: boolean | string | undefined
): void {
  if (!overridesAllowed()) return
  useFlags.setState(({ devOverrides }) => ({
    devOverrides: { ...devOverrides, [flag]: value },
  }))
}

export function setDevFlagPayloadOverride(
  flag: FeatureFlag,
  payload: JsonType | undefined
): void {
  if (!overridesAllowed()) return
  useFlags.setState(({ devPayloadOverrides }) => ({
    devPayloadOverrides: { ...devPayloadOverrides, [flag]: payload },
  }))
}

export const FLAG_RELOAD_INTERVAL_MS = 10 * 60_000

const clearFlags = (status: FeatureFlagsStatus) =>
  useFlags.setState({
    values: {},
    payloads: {},
    distinctId: undefined,
    status,
  })

function hasCurrentValues(): boolean {
  const { status, distinctId } = useFlags.getState()
  return status === 'loaded' && distinctId === posthogClient?.getDistinctId()
}

let loadedAt = 0
let loading = false

function settleFailedLoad(): void {
  loadedAt = 0
  if (!hasCurrentValues()) clearFlags('failed')
}

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

  if (
    !details ||
    details.errorsWhileComputingFlags ||
    details.quotaLimited?.includes(QuotaLimitedFeature.FeatureFlags)
  ) {
    loadedAt = 0
    clearFlags('failed')
    return
  }

  loadedAt = Date.now()
  useFlags.setState({
    values: posthogClient?.getFeatureFlags() ?? {},
    payloads: posthogClient?.getFeatureFlagPayloads() ?? {},
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

    if (values === undefined) settleFailedLoad()
  } catch {
    settleFailedLoad()
  } finally {
    loading = false
  }
}

function loadIfDue(minAgeMs: number): void {
  if (AppState.currentState !== 'active' || getOnline() !== true) {
    settleWaiting()
    return
  }
  if (loadedAt && Date.now() - loadedAt < minAgeMs) return
  void load()
}

export function useInitializeFeatureFlags(): void {
  const online = useOnline()

  useEffect(() => {
    const unsubscribeFlags = posthogClient?.on(
      'featureflags',
      publishLoadedFlags
    )
    const unsubscribePreferences = usePreferences.subscribe(
      (state, previous) => {
        if (previous.analyticsEnabled && !state.analyticsEnabled) {
          loadedAt = 0
          clearFlags('loading')
        }
      }
    )
    const foreground = addForegroundListener(() =>
      loadIfDue(FLAG_RELOAD_INTERVAL_MS)
    )

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

  useEffect(() => {
    if (!loadedAt) loadIfDue(0)
    else settleWaiting()
  }, [online])
}

export function FeatureFlagsRuntime(): null {
  useInitializeFeatureFlags()
  return null
}

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

export function useFeatureFlagsStatus(): FeatureFlagsStatus {
  const status = useFlags((state) => state.status)
  const distinctId = useFlags((state) => state.distinctId)
  if (status === 'loaded' && distinctId !== posthogClient?.getDistinctId())
    return 'loading'
  return status
}

export function useFeatureFlagPayload(flag: FeatureFlag): JsonType | undefined {
  const payload = useFlags((state) => state.payloads[flag])
  const distinctId = useFlags((state) => state.distinctId)
  const devOverride = useFlags((state) => state.devPayloadOverrides[flag])
  if (devOverride !== undefined && overridesAllowed()) return devOverride
  return distinctId !== undefined &&
    distinctId === posthogClient?.getDistinctId()
    ? payload
    : undefined
}

export const DEFAULT_ON_FLAGS: ReadonlySet<FeatureFlag> = new Set(['scribe-ai'])

export function useFeatureFlag(flag: FeatureFlag): boolean {
  const value = useFeatureFlagValue(flag)
  return DEFAULT_ON_FLAGS.has(flag) ? value !== false : value === true
}
