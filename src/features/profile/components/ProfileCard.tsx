import { useRef, useState } from 'react'
import { Pressable, TextInput as RNTextInput, View } from 'react-native'
import moment from 'moment'
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome'
import { IconDefinition } from '@fortawesome/fontawesome-svg-core'
import {
  faChevronRight,
  faClock,
  faHeart,
  faStar,
} from '@fortawesome/free-solid-svg-icons'
import useTheme from '@/contexts/theme'
import { usePreferences } from '@/stores/preferences'
import { useProfile } from '@/stores/profile'
import usePublisher from '@/hooks/usePublisher'
import useUser from '@/hooks/useUser'
import useIsSupporter from '@/hooks/useIsSupporter'
import Card from '@/components/ui/Card'
import Text from '@/components/ui/MyText'
import Avatar from '@/components/ui/Avatar'
import TiltableCard from '@/features/profile/components/TiltableCard'
import ProfileDetailOverlay, {
  OriginRect,
} from '@/features/profile/components/ProfileDetailOverlay'
import AvatarPickerPopover from '@/components/AvatarPickerPopover'
import i18n from '@/lib/locales'
import { ShaderOverlay } from '@/shaders'

interface Props {
  /** Disables interaction; used for the live preview inside onboarding. */
  preview?: boolean
  /**
   * Turns the card into an inline editor: avatar becomes a picker trigger and
   * name becomes a text input. Used by the profile setup sheet + onboarding
   * step so the preview _is_ the form.
   */
  editable?: boolean
  /**
   * Called when the card is tapped in its incomplete state. The home screen
   * wires this to open the existing-user profile setup sheet.
   */
  onPressIncomplete?: () => void
}

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
  icon: IconDefinition
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

const ProfileCard = ({ preview, editable, onPressIncomplete }: Props) => {
  const theme = useTheme()
  const {
    installedOn,
    pioneerStartDate,
    profileCardShaderEnabled,
    profileCardShaderId,
  } = usePreferences()
  // Profile-shaped fields live in the Profile store (wave-3 store split).
  // ProfileCard reads + writes both stores because the card is the editing
  // surface for *Profile* (name, avatar, avatar background, setup flag) while
  // still rendering Preferences-driven chrome (shader toggle, tenure).
  const {
    name,
    avatar,
    customAvatarBackground,
    hasCompletedProfileSetup,
    set: setProfile,
  } = useProfile()
  const { name: trimmedName, hasName } = useUser()
  const { type: publisher, isInFullTimeService } = usePublisher()
  const { since: supporterSince } = useIsSupporter()
  const [detailOpen, setDetailOpen] = useState(false)
  const [origin, setOrigin] = useState<OriginRect | null>(null)
  const anchorRef = useRef<View>(null)

  const isIncomplete = !preview && !editable && !hasCompletedProfileSetup

  const handlePress = () => {
    if (preview) return
    if (isIncomplete) onPressIncomplete?.()
  }

  const handleTap = () => {
    anchorRef.current?.measureInWindow((x, y, width, height) => {
      setOrigin({ x, y, width, height })
      setDetailOpen(true)
    })
  }

  const handleClosed = () => {
    setOrigin(null)
  }

  if (isIncomplete) {
    return (
      <Pressable onPress={handlePress}>
        <Card
          flexDirection='row'
          style={{
            alignItems: 'center',
            gap: 12,
            paddingVertical: CARD_PADDING_V,
            paddingHorizontal: CARD_PADDING_H,
          }}
        >
          <Avatar
            avatar={{ type: 'none', value: '' }}
            size={40}
            background={theme.colors.accentBackground}
          />
          <View style={{ flex: 1 }}>
            <Text
              style={{
                fontFamily: theme.fonts.semiBold,
                fontSize: 15,
                color: theme.colors.text,
              }}
            >
              {i18n.t('profileIncompleteTitle')}
            </Text>
            <Text
              style={{
                fontSize: 12,
                color: theme.colors.textAlt,
                marginTop: 1,
              }}
            >
              {i18n.t('profileIncompleteSubtitle')}
            </Text>
          </View>
          <FontAwesomeIcon
            icon={faChevronRight}
            size={13}
            color={theme.colors.textAlt}
          />
        </Card>
      </Pressable>
    )
  }

  const greeting = hasName
    ? i18n.t('profileGreeting', { name: trimmedName })
    : i18n.t('profileGreetingNoName')

  const tenure: Tenure = (() => {
    if (isInFullTimeService && pioneerStartDate) {
      const tone: TenureTone =
        publisher === 'specialPioneer'
          ? 'specialPioneer'
          : publisher === 'circuitOverseer'
            ? 'circuitOverseer'
            : 'pioneer'
      return {
        tone,
        icon: faStar,
        tint: theme.colors.indigo,
        text: buildTenureText(tone, daysSince(new Date(pioneerStartDate))),
      }
    }
    if (publisher === 'regularAuxiliary' && pioneerStartDate) {
      return {
        tone: 'regularAuxiliary',
        icon: faStar,
        tint: theme.colors.indigo,
        text: buildTenureText(
          'regularAuxiliary',
          daysSince(new Date(pioneerStartDate))
        ),
      }
    }
    if (supporterSince) {
      return {
        tone: 'supporter',
        icon: faHeart,
        tint: theme.colors.supporter,
        text: buildTenureText('supporter', daysSince(supporterSince)),
      }
    }
    return {
      tone: 'installed',
      icon: faClock,
      tint: theme.colors.textAlt,
      text: buildTenureText('installed', daysSince(new Date(installedOn))),
    }
  })()

  // When the holographic shader is on we swap the whole card to a warm
  // cream cardstock + dark text. A Balatro holo is defined by its *light*
  // cardstock underneath the foil — a dark card with pastels over it reads
  // as neon, not holographic. Text colors flip too so they stay legible.
  const holoActive = !preview && !editable && profileCardShaderEnabled
  const cardBg = holoActive ? '#F2E9D2' : theme.colors.card
  const cardBorder = holoActive ? '#D9CDAD' : theme.colors.border
  const titleColor = holoActive ? '#1A1A1A' : theme.colors.text
  const subtitleColor = holoActive ? '#5A5244' : theme.colors.textAlt
  const tenureIconTint = holoActive
    ? tenure.tone === 'installed'
      ? '#5A5244'
      : tenure.tint
    : tenure.tint

  const avatarEl = editable ? (
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
  ) : (
    <Avatar avatar={avatar} name={trimmedName} size={44} />
  )

  const nameEl = editable ? (
    <RNTextInput
      value={name}
      onChangeText={(val) => setProfile({ name: val })}
      placeholder={i18n.t('firstNamePlaceholder')}
      placeholderTextColor={theme.colors.textAlt}
      autoCapitalize='words'
      autoCorrect={false}
      autoFocus={!name}
      maxLength={40}
      returnKeyType='done'
      style={{
        fontFamily: theme.fonts.semiBold,
        fontSize: 16,
        color: titleColor,
        padding: 0,
        margin: 0,
      }}
    />
  ) : (
    <Text
      style={{
        fontFamily: theme.fonts.semiBold,
        fontSize: 16,
        color: titleColor,
      }}
      numberOfLines={1}
    >
      {greeting}
    </Text>
  )

  const cardBody = (
    <Card
      style={{
        paddingVertical: CARD_PADDING_V,
        paddingHorizontal: CARD_PADDING_H,
        gap: 10,
        backgroundColor: cardBg,
        borderWidth: 1,
        borderColor: cardBorder,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        {avatarEl}
        <View style={{ flex: 1 }}>
          {nameEl}
          <Text
            style={{
              fontSize: 12,
              color: subtitleColor,
              marginTop: 1,
            }}
          >
            {i18n.t(publisher)}
          </Text>
        </View>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <FontAwesomeIcon icon={tenure.icon} size={11} color={tenureIconTint} />
        <Text style={{ fontSize: 12, color: subtitleColor }}>
          {tenure.text}
        </Text>
      </View>
    </Card>
  )

  if (preview || editable) {
    return <View>{cardBody}</View>
  }

  return (
    <>
      <View ref={anchorRef} collapsable={false}>
        <TiltableCard
          onTap={handleTap}
          overlayBorderRadius={theme.numbers.borderRadiusLg}
          renderOverlay={(ctx) => (
            <ShaderOverlay
              {...ctx}
              enabled={profileCardShaderEnabled}
              shaderId={profileCardShaderId}
            />
          )}
        >
          {cardBody}
        </TiltableCard>
      </View>
      <ProfileDetailOverlay
        origin={origin}
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        onClosed={handleClosed}
      />
    </>
  )
}

export default ProfileCard
