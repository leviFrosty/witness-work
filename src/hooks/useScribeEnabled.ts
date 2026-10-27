import { useFeatureFlag } from '@/lib/featureFlags'
import { usePreferences } from '@/stores/preferences'

/**
 * PostHog `scribe-ai`, default on (true unless a fresh response says false):
 * whether this build offers Scribe AI at all. Settings uses it to show the
 * switch that turns Scribe AI on and off; Supporter benefits list it.
 */
export function useScribeOffered(): boolean {
  return useFeatureFlag('scribe-ai')
}

/**
 * Whether Scribe AI is on: offered (the flag) and not turned off by the User in
 * Settings. Shared so components outside Scribe AI can hide it too.
 */
export function useScribeEnabled(): boolean {
  const offered = useScribeOffered()
  const turnedOn = usePreferences((s) => s.scribeAiEnabled)
  return offered && turnedOn
}
