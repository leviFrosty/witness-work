import {
  Clock as ClockIcon,
  Heart as HeartIcon,
  Star as StarIcon,
} from 'lucide-react-native'
import type { AppIcon } from '@/components/ui/LucideIcon'
import { InputProps } from 'tamagui'
import moment from 'moment'
import useTheme from '@/contexts/theme'
import { usePreferences } from '@/stores/preferences'
import { useProfile } from '@/stores/profile'
import usePublisher from '@/hooks/usePublisher'
import useUser from '@/hooks/useUser'
import useIsSupporter from '@/hooks/useIsSupporter'
import { isFoundingSupporter } from '@/lib/foundingSupporter'
import ProfileCardLayout from '@/components/ProfileCardLayout'
import AvatarPickerPopover from '@/components/AvatarPickerPopover'
import Avatar from '@/components/ui/Avatar'
import i18n from '@/lib/locales'
import MyTextInput from '@/components/ui/TextInput'

const daysSince = (from: Date): number =>
  Math.max(1, moment().diff(moment(from), 'days'))

type TenureTone =
  | 'supporter'
  | 'foundingSupporter'
  | 'pioneer'
  | 'specialPioneer'
  | 'circuitOverseer'
  | 'regularAuxiliary'
  | 'installed'

type Tenure = {
  tone: TenureTone
  icon: AppIcon
  tint: string
  text: string
}

const buildTenureText = (tone: TenureTone, days: number): string => {
  const formatted = days.toLocaleString()
  switch (tone) {
    case 'supporter':
      return days === 1
        ? i18n.t('profileSupporterForDay')
        : i18n.t('profileSupporterForDays', { days: formatted })
    case 'foundingSupporter':
      return days === 1
        ? i18n.t('profileFoundingSupporterForDay')
        : i18n.t('profileFoundingSupporterForDays', { days: formatted })
    case 'pioneer':
      return days === 1
        ? i18n.t('profilePioneeringForDay')
        : i18n.t('profilePioneeringForDays', { days: formatted })
    case 'specialPioneer':
      return days === 1
        ? i18n.t('profileSpecialPioneeringForDay')
        : i18n.t('profileSpecialPioneeringForDays', { days: formatted })
    case 'circuitOverseer':
      return days === 1
        ? i18n.t('profileCircuitOverseeingForDay')
        : i18n.t('profileCircuitOverseeingForDays', { days: formatted })
    case 'regularAuxiliary':
      return days === 1
        ? i18n.t('profileRegularAuxiliaryForDay')
        : i18n.t('profileRegularAuxiliaryForDays', { days: formatted })
    case 'installed':
      return days === 1
        ? i18n.t('profileUsingForDay')
        : i18n.t('profileUsingForDays', { days: formatted })
  }
}

interface Props {
  /** Shows the profile without editing; used by the profile overlay. */
  readOnly?: boolean
}

/**
 * Inline profile editor: the avatar is a picker and the name a text input, so
 * the preview _is_ the form. Used by profile setup, onboarding, and Buddies.
 * `readOnly` renders the same card as a plain display.
 */
const ProfileCard = ({ readOnly }: Props) => {
  const theme = useTheme()
  const { installedOn, tenureStartDate } = usePreferences()
  // Profile-shaped fields live in the Profile store (wave-3 store split).
  // ProfileCard reads + writes both stores because the card is the editing
  // surface for Profile while tenure remains a Preference.
  const { name, avatar, customAvatarBackground, set: setProfile } = useProfile()
  const { name: trimmedName } = useUser()
  const { type: publisher, isInFullTimeService } = usePublisher()
  const { since: supporterSince } = useIsSupporter()

  const tenure: Tenure = (() => {
    if (isInFullTimeService && tenureStartDate) {
      const tone: TenureTone =
        publisher === 'specialPioneer'
          ? 'specialPioneer'
          : publisher === 'circuitOverseer'
            ? 'circuitOverseer'
            : 'pioneer'
      return {
        tone,
        icon: StarIcon,
        tint: theme.colors.indigo,
        text: buildTenureText(tone, daysSince(new Date(tenureStartDate))),
      }
    }
    if (publisher === 'regularAuxiliary' && tenureStartDate) {
      return {
        tone: 'regularAuxiliary',
        icon: StarIcon,
        tint: theme.colors.indigo,
        text: buildTenureText(
          'regularAuxiliary',
          daysSince(new Date(tenureStartDate))
        ),
      }
    }
    if (supporterSince) {
      const tone: TenureTone = isFoundingSupporter(supporterSince)
        ? 'foundingSupporter'
        : 'supporter'
      return {
        tone,
        icon: HeartIcon,
        tint: theme.colors.supporter,
        text: buildTenureText(tone, daysSince(supporterSince)),
      }
    }
    return {
      tone: 'installed',
      icon: ClockIcon,
      tint: theme.colors.textAlt,
      text: buildTenureText('installed', daysSince(new Date(installedOn))),
    }
  })()

  return (
    <ProfileCardLayout
      avatar={
        readOnly ? (
          <Avatar avatar={avatar} name={trimmedName} size={44} />
        ) : (
          <AvatarPickerPopover
            value={avatar}
            onChange={(next) => setProfile({ avatar: next })}
            name={trimmedName}
            size={44}
            backgroundValue={customAvatarBackground}
            onBackgroundChange={(next) =>
              setProfile({ customAvatarBackground: next })
            }
          />
        )
      }
      title={
        readOnly ? (
          trimmedName || i18n.t('profileGreetingNoName')
        ) : (
          <MyTextInput
            value={name}
            onChangeText={(val) => setProfile({ name: val })}
            placeholder={i18n.t('firstNamePlaceholder')}
            placeholderTextColor={
              theme.colors.textAlt as InputProps['placeholderTextColor']
            }
            autoCapitalize='words'
            autoCorrect={false}
            autoFocus={!name}
            autoFocusNative={!name}
            maxLength={40}
            enterKeyHint='done'
            textAlign='left'
            style={{
              fontFamily: theme.fonts.semiBold,
              fontSize: 16,
              color: theme.colors.text,
            }}
          />
        )
      }
      subtitle={i18n.t(publisher)}
      details={[
        {
          icon: tenure.icon,
          tint: tenure.tint,
          filled:
            tenure.tone === 'supporter' || tenure.tone === 'foundingSupporter',
          text: tenure.text,
        },
      ]}
    />
  )
}

export default ProfileCard
