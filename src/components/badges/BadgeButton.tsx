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

export const measureBadgeOrigin = (
  coin: View | null,
  done: (origin: BadgeViewOrigin | undefined) => void
) => {
  if (!coin) return done(undefined)
  coin.measureInWindow((x, y, width) =>
    done(width > 0 ? { x, y, size: width } : undefined)
  )
}

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

  dotBorderColor?: string

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
