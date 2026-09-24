import { useEffect, useState } from 'react'
import { AppState } from 'react-native'
import { useNetworkState } from 'expo-network'
import { create } from 'zustand'
import { posthogClient } from '@/lib/posthogClient'

// Add future flag keys to this union so call sites stay type-checked.
export type FeatureFlag = 'notes-import' | 'buddies'
type FlagValues = Partial<Record<FeatureFlag, boolean | string>>
const useFlags = create<{ values: FlagValues }>(() => ({ values: {} }))

/** Mount once at the app root. Values are never restored from the SDK cache. */
export function useInitializeFeatureFlags(): void {
  const { isConnected, isInternetReachable } = useNetworkState()
  const [appState, setAppState] = useState(AppState.currentState)

  useEffect(() => {
    const subscription = AppState.addEventListener('change', setAppState)
    return () => subscription.remove()
  }, [])

  useEffect(() => {
    useFlags.setState({ values: {} })
    if (appState !== 'active' || !isConnected || !isInternetReachable) return

    let cancelled = false
    async function load() {
      try {
        const values = await posthogClient?.reloadFeatureFlagsAsync()
        if (!cancelled) useFlags.setState({ values: values ?? {} })
      } catch {
        // Loading and provider failures leave every flag closed.
      }
    }
    void load()
    return () => {
      cancelled = true
      useFlags.setState({ values: {} })
    }
  }, [appState, isConnected, isInternetReachable])
}

/** UI visibility only; access control belongs on the server. */
export function useFeatureFlag(flag: FeatureFlag): boolean {
  return useFlags((state) => state.values[flag] === true)
}
