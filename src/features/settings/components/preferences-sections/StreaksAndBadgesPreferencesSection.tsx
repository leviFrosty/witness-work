import { Award as AwardIcon } from 'lucide-react-native'
import { ChevronForwardIcon } from '@/components/ui/DirectionalIcon'
import { useNavigation } from '@react-navigation/native'
import { View } from 'react-native'
import IconButton from '@/components/ui/IconButton'
import InputRowButton from '@/components/ui/inputs/InputRowButton'
import InputRowSwitch from '@/components/ui/inputs/InputRowSwitch'
import Section from '@/components/ui/inputs/Section'
import useNotifications from '@/hooks/notifications'
import usePublisher from '@/hooks/usePublisher'
import { analytics } from '@/lib/analytics'
import { earnedBadgeCount } from '@/lib/badges/display'
import i18n, { TranslationKey } from '@/lib/locales'
import { hasCapability } from '@/lib/platformCapabilities'
import { usePreferences } from '@/stores/preferences'
import type { RootStackNavigation } from '@/types/rootStack'

/**
 * Whether the Service Streak and Badges show at all. Streak Reminders sit under
 * Show streak, since none go out while it's off.
 */
const StreaksAndBadgesPreferencesSection = () => {
  const navigation = useNavigation<RootStackNavigation>()
  const { streakKind } = usePublisher()
  const showStreaks = usePreferences((s) => s.showStreaks)
  const streakReminders = usePreferences((s) => s.streakReminders)
  const showBadges = usePreferences((s) => s.showBadges)
  const earnedBadges = usePreferences((s) => s.earnedBadges)
  const set = usePreferences((s) => s.set)
  const setShowBadges = usePreferences((s) => s.setShowBadges)
  const notifications = useNotifications()
  const badgeCount = earnedBadgeCount(earnedBadges)

  const handleShowStreaksChange = (enabled: boolean) => {
    set({ showStreaks: enabled })
    analytics.capture('streaks_setting_changed', { enabled })
  }

  const handleStreakRemindersChange = async (next: boolean) => {
    if (next && !notifications.allowed && !(await notifications.turnOn()))
      return
    set({ streakReminders: next })
    analytics.capture('streak_reminders_changed', { enabled: next })
  }

  const handleShowBadgesChange = (enabled: boolean) => {
    setShowBadges(enabled)
    analytics.capture('badges_setting_changed', { setting: 'show', enabled })
  }

  return (
    <View style={{ gap: 30 }}>
      <Section>
        <InputRowSwitch
          label={i18n.t('streaks_showSetting')}
          info={i18n.t('streaks_showSetting_info')}
          value={showStreaks}
          onValueChange={handleShowStreaksChange}
          lastInSection={!showStreaks || !hasCapability('deviceNotifications')}
        />
        {showStreaks && hasCapability('deviceNotifications') && (
          <InputRowSwitch
            label={i18n.t('streakReminders')}
            info={i18n.t(
              streakKind === 'months'
                ? 'streakReminders_infoMonths'
                : 'streakReminders_info'
            )}
            value={streakReminders}
            onValueChange={(next) => void handleStreakRemindersChange(next)}
            lastInSection
          />
        )}
      </Section>

      <Section>
        <InputRowSwitch
          label={i18n.t('badges_showSetting')}
          info={i18n.t('badges_showSetting_info')}
          value={showBadges}
          onValueChange={handleShowBadgesChange}
          lastInSection={!showBadges}
        />
        {showBadges && (
          <InputRowButton
            leftIcon={AwardIcon}
            label={i18n.t('badges_settingsRow')}
            sublabel={
              badgeCount > 0
                ? i18n.t('badges_count' as TranslationKey, {
                    count: badgeCount,
                  })
                : undefined
            }
            onPress={() =>
              navigation.navigate('Badges', { source: 'settings' })
            }
            lastInSection
          >
            <IconButton icon={ChevronForwardIcon} />
          </InputRowButton>
        )}
      </Section>
    </View>
  )
}

export default StreaksAndBadgesPreferencesSection
