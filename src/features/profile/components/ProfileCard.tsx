import {
  Clock as ClockIcon,
  Heart as HeartIcon,
  Star as StarIcon,
} from 'lucide-react-native'
import LucideIcon, { type AppIcon } from '@/components/ui/LucideIcon'
import { View } from 'react-native'
import { InputProps } from 'tamagui'
import moment from 'moment'
import useTheme from '@/contexts/theme'
import { usePreferences } from '@/stores/preferences'
import { useProfile } from '@/stores/profile'
import usePublisher from '@/hooks/usePublisher'
import useUser from '@/hooks/useUser'
import useIsSupporter from '@/hooks/useIsSupporter'
import Card from '@/components/ui/Card'
import Text from '@/components/ui/MyText'
import AvatarPickerPopover from '@/components/AvatarPickerPopover'
import Avatar from '@/components/ui/Avatar'
import i18n from '@/lib/locales'
import MyTextInput from '@/components/ui/TextInput'

const daysSince = (from: Date): number =>
  Math.max(1, moment().diff(moment(from), 'days'))

type TenureTone =
  | 'supporter'
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

const CARD_PADDING_V = 14
const CARD_PADDING_H = 16

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
      return {
        tone: 'supporter',
        icon: HeartIcon,
        tint: theme.colors.supporter,
        text: buildTenureText('supporter', daysSince(supporterSince)),
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
    <Card
      style={{
        paddingVertical: CARD_PADDING_V,
        paddingHorizontal: CARD_PADDING_H,
        gap: 10,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        {readOnly ? (
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
        )}
        <View style={{ flex: 1 }}>
          {readOnly ? (
            <Text
              style={{
                fontFamily: theme.fonts.semiBold,
                fontSize: 16,
                color: theme.colors.text,
              }}
              numberOfLines={1}
            >
              {trimmedName || i18n.t('profileGreetingNoName')}
            </Text>
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
          )}
          <Text
            style={{
              fontSize: 12,
              color: theme.colors.textAlt,
              marginTop: 1,
            }}
          >
            {i18n.t(publisher)}
          </Text>
        </View>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <LucideIcon
          icon={tenure.icon}
          size={11}
          color={tenure.tint}
          fill={tenure.tone === 'supporter' ? tenure.tint : undefined}
        />
        <Text style={{ fontSize: 12, color: theme.colors.textAlt }}>
          {tenure.text}
        </Text>
      </View>
    </Card>
  )
}

export default ProfileCard
