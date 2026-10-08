import { View } from 'react-native'
import Animated, {
  SharedValue,
  useAnimatedStyle,
} from 'react-native-reanimated'
import { UserRound as UserRoundIcon } from 'lucide-react-native'
import BadgeMedallion from '@/components/badges/BadgeMedallion'
import LucideIcon from '@/components/ui/LucideIcon'
import useTheme from '@/contexts/theme'
import { buddySlotColor } from '@/features/buddies/lib/buddyColors'
import {
  CHIP,
  PREVIEW_BADGE,
  T,
} from '@/features/onboarding/constants/badgesPreview'
import {
  VisualText,
  backOut,
} from '@/features/updates/components/reveal/visuals/kit'
import i18n from '@/lib/locales'
import { span } from '@/features/onboarding/components/badges-preview/motion'

/**
 * Who else sees the new badge, as a notification-style chip that slides up
 * under the card: two buddies where Buddies is available, otherwise the User's
 * own profile. The badge pops in at its end once it lands.
 */
const BadgeShareChip = ({
  t,
  buddies,
}: {
  t: SharedValue<number>
  buddies: boolean
}) => {
  const theme = useTheme()
  const avatars = buddies
    ? [buddySlotColor(theme, 0), buddySlotColor(theme, 1)]
    : [theme.colors.accent]

  const chipStyle = useAnimatedStyle(() => {
    const p = span(t.value, T.chip)
    return {
      opacity: Math.min(1, p * 2.5),
      transform: [
        { translateY: (1 - backOut(p)) * 22 },
        { scale: 0.94 + 0.06 * backOut(p) },
      ],
    }
  })
  const medalStyle = useAnimatedStyle(() => {
    const p = span(t.value, T.chipMedal)
    return {
      opacity: Math.min(1, p * 3),
      transform: [{ scale: 0.3 + 0.7 * backOut(p) }],
    }
  })

  return (
    <Animated.View
      style={[
        {
          height: CHIP.height,
          marginTop: -CHIP.overlap,
          paddingLeft: 6,
          paddingRight: 8,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          borderRadius: CHIP.height / 2,
          borderWidth: 1,
          borderColor: theme.colors.border,
          backgroundColor: theme.colors.backgroundLighter,
          shadowColor: theme.colors.shadow,
          shadowOpacity: 0.16,
          shadowRadius: 10,
          shadowOffset: { width: 0, height: 4 },
          elevation: 10,
        },
        chipStyle,
      ]}
    >
      <View style={{ flexDirection: 'row' }}>
        {avatars.map((color, index) => (
          <View
            key={color}
            style={{
              width: CHIP.avatar,
              height: CHIP.avatar,
              borderRadius: CHIP.avatar / 2,
              marginLeft: index === 0 ? 0 : -7,
              borderWidth: 1.5,
              borderColor: theme.colors.backgroundLighter,
              backgroundColor: color,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <LucideIcon
              icon={UserRoundIcon}
              size={CHIP.avatar * 0.55}
              color='#FFFFFF'
              strokeWidth={2.4}
            />
          </View>
        ))}
      </View>
      <VisualText
        style={{ flexShrink: 1, fontSize: 12, color: theme.colors.text }}
      >
        {i18n.t(
          buddies
            ? 'onboardingBadges_seenByBuddies'
            : 'onboardingBadges_onProfile'
        )}
      </VisualText>
      <Animated.View style={medalStyle}>
        <BadgeMedallion
          art={PREVIEW_BADGE.art}
          level={PREVIEW_BADGE.level}
          size={CHIP.medal}
        />
      </Animated.View>
    </Animated.View>
  )
}

export default BadgeShareChip
