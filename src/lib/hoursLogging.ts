import { analytics } from '@/lib/analytics'
import { getEntryMode } from '@/lib/publisherCapabilities'
import { usePreferences } from '@/stores/preferences'
import type { Publisher } from '@/types/publisher'

export type HoursLoggingSource = 'settings' | 'onboarding' | 'tray'

export const setHoursLogging = (
  enabled: boolean,
  source: HoursLoggingSource
) => {
  usePreferences.getState().set({ logsHours: enabled, hoursLoggingAsked: true })
  analytics.capture('hours_logging_changed', { enabled, source })
}

export const shouldAskAboutHoursLogging = ({
  role,
  logsHours,
  hoursLoggingAsked,
}: {
  role: Publisher
  logsHours: boolean
  hoursLoggingAsked: boolean
}) => getEntryMode(role) === 'checkbox' && !logsHours && !hoursLoggingAsked
