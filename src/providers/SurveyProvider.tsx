import type { PropsWithChildren } from 'react'
import { PostHogProvider, PostHogSurveyProvider } from 'posthog-react-native'
import { surveyClient } from '@/lib/analytics'
import { logger } from '@/lib/logger'
import { usePreferences } from '@/stores/preferences'

export default function SurveyProvider({ children }: PropsWithChildren) {
  const { onboardingComplete } = usePreferences()
  if (!surveyClient) return children

  return (
    <PostHogProvider
      client={surveyClient}
      autocapture={false}
      debug={logger.isEnabled()}
    >
      <PostHogSurveyProvider autoPresentSurveys={onboardingComplete}>
        {children}
      </PostHogSurveyProvider>
    </PostHogProvider>
  )
}
