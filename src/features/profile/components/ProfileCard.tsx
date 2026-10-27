import {
  Clock as ClockIcon,
  Heart as HeartIcon,
  Star as StarIcon,
} from 'lucide-react-native'
import type { AppIcon } from '@/components/ui/LucideIcon'
import { InputProps } from 'tamagui'
import moment from 'moment'
import { useState } from 'react'
import useTheme from '@/contexts/theme'
import { usePreferences } from '@/stores/preferences'
import { useProfile } from '@/stores/profile'
import usePublisher from '@/hooks/usePublisher'
import useUser from '@/hooks/useUser'
import useIsSupporter from '@/hooks/useIsSupporter'
import useServiceStreak from '@/hooks/useServiceStreak'
import { isFoundingSupporter } from '@/lib/foundingSupporter'
import { shownStreak } from '@/lib/serviceStreak'
import ProfileCardLayout from '@/components/ProfileCardLayout'
import StreakBadge from '@/components/StreakBadge'
import AvatarPickerPopover from '@/components/AvatarPickerPopover'
import Avatar from '@/components/ui/Avatar'
import i18n, { type TranslationKey } from '@/lib/locales'
import { formatNumber } from '@/lib/numbers'
import MyTextInput from '@/components/ui/TextInput'
import { profileBadges } from '@/lib/badges/display'
import ProfileCardBadges from '@/features/profile/components/ProfileCardBadges'
import { useShallow } from 'zustand/react/shallow'

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

// One plural key per tone, so each Language words "for N days" its own way.
const TENURE_KEYS: Record<TenureTone, string> = {
  supporter: 'profileSupporterFor',
  foundingSupporter: 'profileFoundingSupporterFor',
  pioneer: 'profilePioneeringFor',
  specialPioneer: 'profileSpecialPioneeringFor',
  circuitOverseer: 'profileCircuitOverseeingFor',
  regularAuxiliary: 'profileRegularAuxiliaryFor',
  installed: 'profileUsingFor',
}

const buildTenureText = (tone: TenureTone, days: number): string =>
  i18n.t(TENURE_KEYS[tone] as TranslationKey, {
    count: days,
    days: formatNumber(days),
  })

interface Props {
  nameInvalid?: boolean
  /** Shows the profile without editing; used by the profile overlay. */
  readOnly?: boolean
  /** Leaves out the badge row, e.g. where badges have their own section. */
  hideBadges?: boolean
  /**
   * Shown in place of this device's Profile name until the User edits it:
   * Buddies setup shows the name on the account's Buddy Card. Editing sets the
   * Profile name, as always, which the card name follows.
   */
  shownName?: string
  /** Opens the keyboard on an empty name. Defaults to true. */
  autoFocusName?: boolean
}

/**
 * Inline profile editor: the avatar is a picker and the name a text input, so
 * the preview _is_ the form. Used by profile setup, onboarding, and Buddies.
 * `readOnly` renders the same card as a plain display. Earned badges show
 * underneath unless the User turned badges off.
 */
const ProfileCard = ({
  readOnly,
  hideBadges,
  nameInvalid,
  shownName,
  autoFocusName = true,
}: Props) => {
  const theme = useTheme()
  const [nameEdited, setNameEdited] = useState(false)
  const {
    installedOn,
    tenureStartDate,
    earnedBadges,
    showBadges,
    showStreaks,
  } = usePreferences(
    useShallow((s) => ({
      installedOn: s.installedOn,
      tenureStartDate: s.tenureStartDate,
      earnedBadges: s.earnedBadges,
      showBadges: s.showBadges,
      showStreaks: s.showStreaks,
    }))
  )
  const badges = showBadges && !hideBadges ? profileBadges(earnedBadges) : []
  // Profile-shaped fields live in the Profile store (wave-3 store split).
  // ProfileCard reads + writes both stores because the card is the editing
  // surface for Profile while tenure remains a Preference.
  const { name, avatar, customAvatarBackground, set: setProfile } = useProfile()
  const { name: profileName } = useUser()
  const showsOtherName = shownName !== undefined && !nameEdited
  const fieldName = showsOtherName ? shownName : name
  const trimmedName = showsOtherName ? shownName.trim() : profileName
  const { type: publisher, isInFullTimeService } = usePublisher()
  const { since: supporterSince } = useIsSupporter()
  const serviceStreak = shownStreak(useServiceStreak())
  const streak = showStreaks ? serviceStreak : 0

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
          <Avatar avatar={avatar} name={trimmedName} size={44} focusable />
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
            invalid={nameInvalid}
            value={fieldName}
            onChangeText={(val) => {
              setNameEdited(true)
              setProfile({ name: val })
            }}
            placeholder={i18n.t('firstNamePlaceholder')}
            placeholderTextColor={
              theme.colors.textAlt as InputProps['placeholderTextColor']
            }
            autoCapitalize='words'
            autoCorrect={false}
            autoFocus={autoFocusName && !fieldName}
            autoFocusNative={autoFocusName && !fieldName}
            maxLength={40}
            enterKeyHint='done'
            textAlign='start'
            style={{
              fontFamily: theme.fonts.semiBold,
              fontSize: 16,
              color: theme.colors.text,
            }}
          />
        )
      }
      subtitle={i18n.t(publisher)}
      trailing={streak > 0 ? <StreakBadge count={streak} /> : undefined}
      details={[
        {
          icon: tenure.icon,
          tint: tenure.tint,
          filled:
            tenure.tone === 'supporter' || tenure.tone === 'foundingSupporter',
          text: tenure.text,
        },
      ]}
      footer={
        badges.length > 0 ? <ProfileCardBadges badges={badges} /> : undefined
      }
    />
  )
}

export default ProfileCard
