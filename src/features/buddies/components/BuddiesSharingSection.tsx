import { ChevronForwardIcon } from '@/components/ui/DirectionalIcon'
import { useNavigation } from '@react-navigation/native'
import Avatar from '@/components/ui/Avatar'
import InputRowSwitch from '@/components/ui/inputs/InputRowSwitch'
import LucideIcon from '@/components/ui/LucideIcon'
import useTheme from '@/contexts/theme'
import useServiceStreak from '@/hooks/useServiceStreak'
import { analytics } from '@/lib/analytics'
import i18n from '@/lib/locales'
import { shownStreak } from '@/lib/serviceStreak'
import { logger } from '@/lib/logger'
import { usePreferences } from '@/stores/preferences'
import { useProfile } from '@/stores/profile'
import { RootStackNavigation } from '@/types/rootStack'
import BuddiesSection from '@/features/buddies/components/BuddiesSection'
import BuddyListRow from '@/features/buddies/components/BuddyListRow'
import { buddiesEngine } from '@/features/buddies/lib/buddiesService'
import {
  buddyTenureFor,
  buddyTenureLabel,
} from '@/features/buddies/lib/buddyProfile'
import type { BuddySharing } from '@/features/buddies/lib/state'
import { useBuddies } from '@/features/buddies/stores/buddiesStore'

/**
 * How buddies see me: the Profile (edited on its own screen) and switches for
 * the parts I can withhold. Name and Plans are the point, so they always go.
 * The streak switch shows before there's a streak, so it can be off from the
 * start. Streak and Badges are offered only while each shows at all.
 */
export default function BuddiesSharingSection() {
  const theme = useTheme()
  const navigation = useNavigation<RootStackNavigation>()
  const { name, avatar, customAvatarBackground } = useProfile()
  const role = usePreferences((state) => state.role)
  const tenureStartDate = usePreferences((state) => state.tenureStartDate)
  const tenure = buddyTenureFor(role, tenureStartDate)
  const sharing = useBuddies((state) => state.sharing)
  const streak = shownStreak(useServiceStreak())
  const showBadges = usePreferences((state) => state.showBadges)
  const showStreaks = usePreferences((state) => state.showStreaks)
  const hasPhoto = avatar.type !== 'none'
  const last = showBadges
    ? 'badges'
    : showStreaks
      ? 'streak'
      : tenure
        ? 'tenure'
        : hasPhoto
          ? 'photo'
          : 'profile'

  // Saved at once; a failed republish is retried by the next sync.
  const share = (change: Partial<Omit<BuddySharing, 'updatedAt'>>) =>
    buddiesEngine
      .setSharing(change)
      .catch((error) => logger.warn('[buddies] sharing', error))

  return (
    <BuddiesSection title={i18n.t('buddies_onboardingProfileTitle')}>
      <BuddyListRow
        last={last === 'profile'}
        leading={
          <Avatar
            avatar={avatar}
            name={name}
            background={customAvatarBackground ?? undefined}
          />
        }
        title={name.trim() || i18n.t('buddies_editProfile')}
        subtitle={name.trim() ? i18n.t('buddies_editProfile') : undefined}
        onPress={() => navigation.navigate('PreferencesPublisher')}
        accessory={
          <LucideIcon
            icon={ChevronForwardIcon}
            size={18}
            color={theme.colors.textAlt}
          />
        }
      />
      {hasPhoto && (
        <InputRowSwitch
          label={i18n.t('buddies_sharePhoto')}
          value={sharing.photo}
          onValueChange={(photo) => share({ photo })}
          lastInSection={last === 'photo'}
        />
      )}
      {tenure && (
        <InputRowSwitch
          label={i18n.t('buddies_shareTenure')}
          description={buddyTenureLabel(tenure)}
          value={sharing.tenure}
          onValueChange={(value) => share({ tenure: value })}
          lastInSection={last === 'tenure'}
        />
      )}
      {showStreaks && (
        <InputRowSwitch
          label={i18n.t('buddies_shareStreak')}
          description={
            streak > 0
              ? i18n.t('buddies_shareStreakCount', { count: streak })
              : undefined
          }
          value={sharing.streak}
          onValueChange={(value) => share({ streak: value })}
          lastInSection={last === 'streak'}
        />
      )}
      {showBadges && (
        <InputRowSwitch
          label={i18n.t('buddies_shareBadges')}
          value={sharing.badges}
          onValueChange={(badges) => {
            analytics.capture('badges_setting_changed', {
              setting: 'share',
              enabled: badges,
            })
            void share({ badges })
          }}
          lastInSection
        />
      )}
    </BuddiesSection>
  )
}
