import { ChevronRight as ChevronRightIcon } from 'lucide-react-native'
import { useNavigation } from '@react-navigation/native'
import Avatar from '@/components/ui/Avatar'
import InputRowSwitch from '@/components/ui/inputs/InputRowSwitch'
import LucideIcon from '@/components/ui/LucideIcon'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
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
 */
export default function BuddiesSharingSection() {
  const theme = useTheme()
  const navigation = useNavigation<RootStackNavigation>()
  const { name, avatar, customAvatarBackground } = useProfile()
  const role = usePreferences((state) => state.role)
  const tenureStartDate = usePreferences((state) => state.tenureStartDate)
  const tenure = buddyTenureFor(role, tenureStartDate)
  const sharing = useBuddies((state) => state.sharing)
  const hasPhoto = avatar.type !== 'none'

  // Saved at once; a failed republish is retried by the next sync.
  const share = (change: Partial<Omit<BuddySharing, 'updatedAt'>>) =>
    buddiesEngine
      .setSharing(change)
      .catch((error) => logger.warn('[buddies] sharing', error))

  return (
    <BuddiesSection title={i18n.t('buddies_onboardingProfileTitle')}>
      <BuddyListRow
        last={!hasPhoto && !tenure}
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
        trailing={
          <LucideIcon
            icon={ChevronRightIcon}
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
          lastInSection={!tenure}
        />
      )}
      {tenure && (
        <InputRowSwitch
          label={i18n.t('buddies_shareTenure')}
          description={buddyTenureLabel(tenure)}
          value={sharing.tenure}
          onValueChange={(value) => share({ tenure: value })}
          lastInSection
        />
      )}
    </BuddiesSection>
  )
}
