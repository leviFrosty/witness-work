import Section from '@/components/ui/inputs/Section'
import InputRowSwitch from '@/components/ui/inputs/InputRowSwitch'
import useNotifications from '@/hooks/notifications'
import usePublisher from '@/hooks/usePublisher'
import { analytics } from '@/lib/analytics'
import i18n from '@/lib/locales'
import { usePreferences } from '@/stores/preferences'

/** Reminders that the Service Streak is about to end. */
const StreakRemindersSection = () => {
  const { streakKind } = usePublisher()
  const enabled = usePreferences((s) => s.streakReminders)
  const set = usePreferences((s) => s.set)
  const notifications = useNotifications()

  const handleChange = async (next: boolean) => {
    if (next && !notifications.allowed && !(await notifications.turnOn()))
      return
    set({ streakReminders: next })
    analytics.capture('streak_reminders_changed', { enabled: next })
  }

  return (
    <Section>
      <InputRowSwitch
        label={i18n.t('streakReminders')}
        info={i18n.t(
          streakKind === 'months'
            ? 'streakReminders_infoMonths'
            : 'streakReminders_info'
        )}
        value={enabled}
        onValueChange={(next) => void handleChange(next)}
        lastInSection
      />
    </Section>
  )
}

export default StreakRemindersSection
