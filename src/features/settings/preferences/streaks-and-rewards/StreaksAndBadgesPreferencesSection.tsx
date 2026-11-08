import { Award as AwardIcon } from 'lucide-react-native'
import { ChevronForwardIcon } from '@/components/ui/DirectionalIcon'
import { useNavigation } from '@react-navigation/native'
import { View } from 'react-native'
import IconButton from '@/components/ui/IconButton'
import InputRowButton from '@/components/ui/inputs/InputRowButton'
import InputRowSwitch from '@/components/ui/inputs/InputRowSwitch'
import Section from '@/components/ui/inputs/Section'
import { analytics } from '@/lib/analytics'
import { earnedBadgeCount } from '@/lib/badges/display'
import i18n, { TranslationKey } from '@/lib/locales'
import { usePreferences } from '@/stores/preferences'
import type { RootStackNavigation } from '@/types/rootStack'
import SettingsSearchTarget from '@/features/settings/components/search/SettingsSearchTarget'

const StreaksAndBadgesPreferencesSection = () => {
  const navigation = useNavigation<RootStackNavigation>()
  const showStreaks = usePreferences((s) => s.showStreaks)
  const showBadges = usePreferences((s) => s.showBadges)
  const earnedBadges = usePreferences((s) => s.earnedBadges)
  const set = usePreferences((s) => s.set)
  const setShowBadges = usePreferences((s) => s.setShowBadges)
  const badgeCount = earnedBadgeCount(earnedBadges)

  const handleShowStreaksChange = (enabled: boolean) => {
    set({ showStreaks: enabled })
    analytics.capture('streaks_setting_changed', { enabled })
  }

  const handleShowBadgesChange = (enabled: boolean) => {
    setShowBadges(enabled)
    analytics.capture('badges_setting_changed', { setting: 'show', enabled })
  }

  return (
    <View style={{ gap: 30 }}>
      <Section>
        <SettingsSearchTarget id='showStreak'>
          <InputRowSwitch
            label={i18n.t('streaks_showSetting')}
            info={i18n.t('streaks_showSetting_info')}
            value={showStreaks}
            onValueChange={handleShowStreaksChange}
            lastInSection
          />
        </SettingsSearchTarget>
      </Section>

      <Section>
        <SettingsSearchTarget id='showBadges'>
          <InputRowSwitch
            label={i18n.t('badges_showSetting')}
            info={i18n.t('badges_showSetting_info')}
            value={showBadges}
            onValueChange={handleShowBadgesChange}
            lastInSection={!showBadges}
          />
        </SettingsSearchTarget>
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
