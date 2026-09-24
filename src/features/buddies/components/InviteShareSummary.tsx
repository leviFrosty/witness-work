import { View } from 'react-native'
import {
  Award as AwardIcon,
  CalendarDays as CalendarDaysIcon,
  Image as ImageIcon,
  Lock as LockIcon,
  UserRound as UserRoundIcon,
} from 'lucide-react-native'
import Card from '@/components/ui/Card'
import InfoPopover from '@/components/ui/InfoPopover'
import LucideIcon, { AppIcon } from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import { usePreferences } from '@/stores/preferences'
import { useProfile } from '@/stores/profile'
import { buddyTenureFor } from '@/features/buddies/lib/buddyProfile'
import { useBuddies } from '@/features/buddies/stores/buddiesStore'

function Chip({ icon, label }: { icon: AppIcon; label: string }) {
  const theme = useTheme()
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingVertical: 6,
        paddingHorizontal: 10,
        borderRadius: 999,
        backgroundColor: theme.colors.backgroundLighter,
        borderWidth: 1,
        borderColor: theme.colors.border,
      }}
    >
      <LucideIcon icon={icon} size={14} color={theme.colors.textAlt} />
      <Text style={{ fontSize: theme.fontSize('sm') }}>{label}</Text>
    </View>
  )
}

/**
 * What accepting shares, at a glance: each other's plans, the parts of my
 * Profile I share (the inviter's show in the header above), and what stays
 * private. The full list lives in the info popover.
 */
export default function InviteShareSummary() {
  const theme = useTheme()
  const sharing = useBuddies((state) => state.sharing)
  const hasPhoto = useProfile((state) => state.avatar.type !== 'none')
  const role = usePreferences((state) => state.role)
  const tenureStartDate = usePreferences((state) => state.tenureStartDate)
  const sharesTenure =
    sharing.tenure && buddyTenureFor(role, tenureStartDate) !== undefined

  return (
    <Card style={{ gap: 16 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View
          style={{
            width: 36,
            height: 36,
            borderRadius: 18,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: theme.colors.accentTranslucent,
          }}
        >
          <LucideIcon
            icon={CalendarDaysIcon}
            size={18}
            color={theme.colors.accent}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontFamily: theme.fonts.semiBold }}>
            {i18n.t('buddies_invitePlansTitle')}
          </Text>
          <Text
            style={{
              color: theme.colors.textAlt,
              fontSize: theme.fontSize('sm'),
            }}
          >
            {i18n.t('buddies_invitePlansHorizon')}
          </Text>
        </View>
      </View>
      <View style={{ gap: 8 }}>
        <Text
          style={{
            color: theme.colors.textAlt,
            fontSize: theme.fontSize('sm'),
          }}
        >
          {i18n.t('buddies_inviteYouAlsoShare')}
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          <Chip icon={UserRoundIcon} label={i18n.t('name')} />
          {sharing.photo && hasPhoto && (
            <Chip icon={ImageIcon} label={i18n.t('buddies_sharePhoto')} />
          )}
          {sharesTenure && (
            <Chip icon={AwardIcon} label={i18n.t('buddies_shareTenure')} />
          )}
        </View>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <LucideIcon icon={LockIcon} size={14} color={theme.colors.textAlt} />
        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }}>
          <Text
            style={{
              flexShrink: 1,
              color: theme.colors.textAlt,
              fontSize: theme.fontSize('sm'),
            }}
          >
            {i18n.t('buddies_invitePrivate')}
          </Text>
          <InfoPopover
            inline
            title={i18n.t('buddies_onboardingEncryptedTitle')}
            description={i18n.t('buddies_invitePrivateInfo')}
          />
        </View>
      </View>
    </Card>
  )
}
