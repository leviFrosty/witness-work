import { useRef } from 'react'
import type { StyleProp, ViewStyle } from 'react-native'
import { View } from 'react-native'
import BadgeMedallion from '@/components/badges/BadgeMedallion'
import Button from '@/components/ui/Button'
import PointerTooltip from '@/components/ui/PointerTooltip'
import useTheme from '@/contexts/theme'
import { badgeTitle } from '@/lib/badges/display'
import i18n from '@/lib/locales'
import type { BadgeArtId, BadgeLevel } from '@/types/badges'
import type { BadgeViewOrigin } from '@/types/rootStack'

type BadgeState = 'earned' | 'locked'

/**
 * A badge's spoken name: its full title, plus "new" or "not yet earned". The
 * medallion art is decorative, so whatever wraps it reads this instead.
 */
export const badgeAccessibilityLabel = (
  art: BadgeArtId,
  level: BadgeLevel | null,
  { state = 'earned', isNew = false }: { state?: BadgeState; isNew?: boolean }
) => {
  const title = badgeTitle(art, level)
  if (state === 'locked') return i18n.t('badges_lockedA11y', { title })
  if (isNew) return i18n.t('badges_newA11y', { title })
  return title
}

/**
 * Measures a coin in window coordinates for a badge view to grow out of.
 * Undefined when it isn't laid out (e.g. already unmounting).
 */
export const measureBadgeOrigin = (
  coin: View | null,
  done: (origin: BadgeViewOrigin | undefined) => void
) => {
  if (!coin) return done(undefined)
  coin.measureInWindow((x, y, width) =>
    done(width > 0 ? { x, y, size: width } : undefined)
  )
}

/**
 * A tappable medallion that opens its badge. Earned medallions lift under an
 * iPad pointer like other small opaque controls; locked outlines highlight. A
 * "new" dot marks badges earned since the User last looked. Set `tooltip` where
 * no label shows the badge's name nearby. `onPress` gets the coin's window
 * rect, so the badge view can grow out of it.
 */
export default function BadgeButton({
  art,
  level,
  size,
  state = 'earned',
  isNew = false,
  onPress,
  dotBorderColor,
  tooltip = false,
  style,
}: {
  art: BadgeArtId
  level: BadgeLevel | null
  size: number
  state?: BadgeState
  isNew?: boolean
  onPress: (origin: BadgeViewOrigin | undefined) => void
  /** Ring around the "new" dot; match the surface behind the medallion. */
  dotBorderColor?: string
  /** Names the badge when an iPad pointer rests on it. */
  tooltip?: boolean
  style?: StyleProp<ViewStyle>
}) {
  const theme = useTheme()
  const coin = useRef<View>(null)
  const dot = Math.min(14, Math.max(9, Math.round(size * 0.2)))
  const effect = state === 'locked' ? 'highlight' : 'lift'
  const button = (
    <Button
      onPress={() => measureBadgeOrigin(coin.current, onPress)}
      accessibilityRole='button'
      accessibilityLabel={badgeAccessibilityLabel(art, level, {
        state,
        isNew,
      })}
      hitSlop={Math.max(6, (44 - size) / 2)}
      pointerEffect={tooltip ? 'none' : effect}
      style={[{ width: size, height: size, borderRadius: size / 2 }, style]}
    >
      <View ref={coin} collapsable={false}>
        <BadgeMedallion art={art} level={level} size={size} state={state} />
      </View>
      {isNew && (
        <View
          pointerEvents='none'
          style={{
            position: 'absolute',
            top: size * 0.02,
            right: size * 0.02,
            width: dot,
            height: dot,
            borderRadius: dot / 2,
            backgroundColor: theme.colors.accent,
            borderWidth: 2,
            borderColor: dotBorderColor ?? theme.colors.card,
          }}
        />
      )}
    </Button>
  )
  if (!tooltip) return button
  return (
    <PointerTooltip
      label={badgeTitle(art, level)}
      effect={effect}
      style={{ borderRadius: size / 2 }}
    >
      {button}
    </PointerTooltip>
  )
}
