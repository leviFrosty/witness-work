import { View } from 'react-native'
import Button from '@/components/ui/Button'
import PointerTooltip from '@/components/ui/PointerTooltip'
import { MIN_TOUCH_TARGET } from '@/components/ui/touchTarget'
import useTheme from '@/contexts/theme'

export const REMOVE_BADGE_SIZE = 24
/**
 * How far the badge's touch frame reaches past the badge, out from its item.
 * The rest of the frame reaches in over the item, not out into the gap toward
 * the neighbors' resize handles.
 */
const OUTSET = 4

/**
 * Where a badge's center sits from the corner of a box with this radius: on the
 * rounded corner itself, as on the Home Screen, rather than out past it.
 */
export const cornerInset = (radius: number) => radius * (1 - Math.SQRT1_2)

/**
 * Where the center of a badge's touch frame sits from the corner of a box with
 * this radius, along both edges. The frame is `MIN_TOUCH_TARGET` square.
 */
export const removeBadgeTargetInset = (radius: number) =>
  cornerInset(radius) - REMOVE_BADGE_SIZE / 2 - OUTSET + MIN_TOUCH_TARGET / 2

/**
 * The gray minus at an item's top leading corner while a screen is being
 * edited, as on the Home Screen. It removes the item; the screen offers Undo.
 */
export default function RemoveBadge({
  label,
  onPress,
  radius,
  top = 0,
}: {
  /** E.g. "Remove Daily Pace". */
  label: string
  onPress: () => void
  /** The item's corner radius. */
  radius: number
  /** Where the item's box starts, below a heading (`ReorderableItemBox`). */
  top?: number
}) {
  const theme = useTheme()
  const dark = theme.colors.background === '#121212'
  const offset = cornerInset(radius) - REMOVE_BADGE_SIZE / 2 - OUTSET
  return (
    <View
      style={{
        position: 'absolute',
        top: top + offset,
        start: offset,
        zIndex: 2,
      }}
    >
      {/* A real frame with the badge in its top leading corner: the item's
          drag can't take a touch on it, as it could on slop. */}
      <Button
        onPress={onPress}
        accessibilityLabel={label}
        pointerEffect='none'
        style={{
          width: MIN_TOUCH_TARGET,
          height: MIN_TOUCH_TARGET,
          paddingTop: OUTSET,
          paddingStart: OUTSET,
          alignItems: 'flex-start',
        }}
      >
        <PointerTooltip
          label={label}
          effect='lift'
          style={{ borderRadius: REMOVE_BADGE_SIZE / 2 }}
        >
          <View
            style={{
              width: REMOVE_BADGE_SIZE,
              height: REMOVE_BADGE_SIZE,
              borderRadius: REMOVE_BADGE_SIZE / 2,
              alignItems: 'center',
              justifyContent: 'center',
              // The system's gray fills (gray 4 and gray 3 in dark mode).
              backgroundColor: dark ? '#48484A' : '#D1D1D6',
              shadowColor: theme.colors.shadow,
              shadowOpacity: 0.18,
              shadowRadius: 3,
              shadowOffset: { width: 0, height: 1 },
              elevation: 3,
            }}
          >
            <View
              style={{
                width: 10,
                height: 2.5,
                borderRadius: 1.25,
                backgroundColor: dark ? '#F2F2F7' : '#1C1C1E',
              }}
            />
          </View>
        </PointerTooltip>
      </Button>
    </View>
  )
}
