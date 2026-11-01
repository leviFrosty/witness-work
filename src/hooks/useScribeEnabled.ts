import { useFeatureFlag } from '@/lib/featureFlags'
import { usePreferences } from '@/stores/preferences'

export function useScribeOffered(): boolean {
  return useFeatureFlag('scribe-ai')
}

export function useScribeEnabled(): boolean {
  const offered = useScribeOffered()
  const turnedOn = usePreferences((s) => s.scribeAiEnabled)
  return offered && turnedOn
}
