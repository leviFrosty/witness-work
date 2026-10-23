import { useFeatureFlag } from '@/lib/featureFlags'

/**
 * PostHog `scribe-ai`, default on (true unless a fresh response says false).
 * Shared so components outside Scribe AI (Supporter benefits) can hide it too.
 */
export function useScribeEnabled(): boolean {
  return useFeatureFlag('scribe-ai')
}
