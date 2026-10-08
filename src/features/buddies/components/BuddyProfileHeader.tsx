import {
  Star as StarIcon,
  UsersRound as UsersRoundIcon,
} from 'lucide-react-native'
import moment from 'moment'
import ProfileCardLayout, {
  type ProfileCardDetail,
} from '@/components/ProfileCardLayout'
import StreakBadge from '@/components/StreakBadge'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import BuddyAvatar from '@/features/buddies/components/BuddyAvatar'
import {
  buddyDisplayName,
  buddyStreakCount,
  buddyTenureLabel,
} from '@/features/buddies/lib/buddyProfile'
import type { Buddy } from '@/features/buddies/lib/state'

/**
 * A buddy on the same card as the User's own Profile. Under a nickname, their
 * own name stays visible as the subtitle. Their badges get their own section
 * right below (`BuddyBadgesSection`).
 */
export default function BuddyProfileHeader({ buddy }: { buddy: Buddy }) {
  const theme = useTheme()
  const name = buddyDisplayName(buddy)
  const streak = buddyStreakCount(buddy.streak)
  const details: ProfileCardDetail[] = [
    buddy.tenure && {
      icon: StarIcon,
      tint: theme.colors.indigo,
      text: buddyTenureLabel(buddy.tenure),
    },
    {
      icon: UsersRoundIcon,
      tint: theme.colors.textAlt,
      text: i18n.t('buddies_sharingSince', {
        date: moment(buddy.pairedAt).format('LL'),
      }),
    },
  ].filter((detail): detail is ProfileCardDetail => !!detail)

  return (
    <ProfileCardLayout
      avatar={
        <BuddyAvatar
          avatar={buddy.avatar}
          name={name}
          color={buddy}
          size={44}
          focusable
        />
      }
      title={name}
      subtitle={buddy.nickname ? buddy.name : undefined}
      trailing={streak > 0 ? <StreakBadge count={streak} /> : undefined}
      details={details}
    />
  )
}
