import type { PropsWithChildren } from 'react'
import { PostHogProvider, PostHogSurveyProvider } from 'posthog-react-native'
import { surveyClient } from '@/lib/analytics'
import { logger } from '@/lib/logger'
import { useIsTakingOver } from '@/hooks/useTakeoverTurn'
import { usePreferences } from '@/stores/preferences'

/**
 * PostHog popover surveys, presented automatically once onboarding is done and
 * only while nothing is taking over the screen (ADR 0021). One already on
 * screen stays until it's answered.
 */
export default function SurveyProvider({ children }: PropsWithChildren) {
  const onboardingComplete = usePreferences((s) => s.onboardingComplete)
  const takingOver = useIsTakingOver()
  if (!surveyClient) return children

  return (
    <PostHogProvider
      client={surveyClient}
      autocapture={false}
      debug={logger.isEnabled()}
    >
      <PostHogSurveyProvider
        autoPresentSurveys={onboardingComplete && !takingOver}
      >
        {children}
      </PostHogSurveyProvider>
    </PostHogProvider>
  )
}
