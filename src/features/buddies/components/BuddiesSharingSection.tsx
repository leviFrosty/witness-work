import { ChevronForwardIcon } from '@/components/ui/DirectionalIcon'
import { useNavigation } from '@react-navigation/native'
import Avatar from '@/components/ui/Avatar'
import LucideIcon from '@/components/ui/LucideIcon'
import useTheme from '@/contexts/theme'
import useServiceStreak from '@/hooks/useServiceStreak'
import i18n from '@/lib/locales'
import { shownStreak } from '@/lib/serviceStreak'
import { usePet } from '@/stores/pet'
import { usePreferences } from '@/stores/preferences'
import { useProfile } from '@/stores/profile'
import { RootStackNavigation } from '@/types/rootStack'
import BuddiesSection from '@/features/buddies/components/BuddiesSection'
import BuddyListRow from '@/features/buddies/components/BuddyListRow'
import { ScopedSwitchRow } from '@/features/buddies/components/ScopedSettingRows'
import {
  useBuddySettingsScope,
  useScopedSetting,
} from '@/features/buddies/hooks/useBuddySettingsScope'
import {
  buddyDisplayName,
  buddyTenureFor,
  buddyTenureLabel,
} from '@/features/buddies/lib/buddyProfile'
import useBuddiesCardName from '@/features/buddies/hooks/useBuddiesCardName'

export default function BuddiesSharingSection({
  withoutProfile = false,
}: {
  withoutProfile?: boolean
} = {}) {
  const theme = useTheme()
  const navigation = useNavigation<RootStackNavigation>()
  const { buddy } = useBuddySettingsScope()
  const { avatar, customAvatarBackground } = useProfile()
  const name = useBuddiesCardName()
  const role = usePreferences((state) => state.role)
  const tenureStartDate = usePreferences((state) => state.tenureStartDate)
  const tenure = buddyTenureFor(role, tenureStartDate)
  const photo = useScopedSetting('photo')
  const tenureSetting = useScopedSetting('tenure')
  const streakSetting = useScopedSetting('streak')
  const badges = useScopedSetting('badges')
  const petSetting = useScopedSetting('pet')
  const streak = shownStreak(useServiceStreak())
  const showBadges = usePreferences((state) => state.showBadges)
  const showStreaks = usePreferences((state) => state.showStreaks)
  const pet = usePet((state) => state.pet)
  const hasPhoto = avatar.type !== 'none'
  const profileRow = !withoutProfile && !buddy
  const last = pet
    ? 'pet'
    : showBadges
      ? 'badges'
      : showStreaks
        ? 'streak'
        : tenure
          ? 'tenure'
          : hasPhoto
            ? 'photo'
            : 'profile'

  if (!profileRow && last === 'profile') return null

  return (
    <BuddiesSection
      title={
        buddy
          ? i18n.t('buddies_buddySeesTitle', { name: buddyDisplayName(buddy) })
          : i18n.t(
              withoutProfile
                ? 'buddies_onboardingSharedTitle'
                : 'buddies_onboardingProfileTitle'
            )
      }
      footer={withoutProfile ? i18n.t('buddies_sharingChangeLater') : undefined}
    >
      {profileRow && (
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
      )}
      {hasPhoto && (
        <ScopedSwitchRow
          setting={photo}
          label={i18n.t('buddies_sharePhoto')}
          lastInSection={last === 'photo'}
        />
      )}
      {tenure && (
        <ScopedSwitchRow
          setting={tenureSetting}
          label={i18n.t('buddies_shareTenure')}
          description={buddyTenureLabel(tenure)}
          lastInSection={last === 'tenure'}
        />
      )}
      {showStreaks && (
        <ScopedSwitchRow
          setting={streakSetting}
          label={i18n.t('buddies_shareStreak')}
          description={
            streak > 0
              ? i18n.t('buddies_shareStreakCount', { count: streak })
              : undefined
          }
          lastInSection={last === 'streak'}
        />
      )}
      {showBadges && (
        <ScopedSwitchRow
          setting={badges}
          label={i18n.t('buddies_shareBadges')}
          lastInSection={last === 'badges'}
        />
      )}
      {pet && (
        <ScopedSwitchRow
          setting={petSetting}
          label={i18n.t('buddies_sharePet')}
          description={pet.name}
          lastInSection
        />
      )}
    </BuddiesSection>
  )
}
