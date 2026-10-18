import { View } from 'react-native'
import Button from '@/components/ui/Button'
import PointerTooltip from '@/components/ui/PointerTooltip'
import useTheme from '@/contexts/theme'
import { isRtlLayout } from '@/lib/direction'

export const REMOVE_BADGE_SIZE = 24

/**
 * Where a badge's center sits from the corner of a box with this radius: on the
 * rounded corner itself, as on the Home Screen, rather than out past it.
 */
export const cornerInset = (radius: number) => radius * (1 - Math.SQRT1_2)

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
  const rtl = isRtlLayout()
  const dark = theme.colors.background === '#121212'
  const offset = cornerInset(radius) - REMOVE_BADGE_SIZE / 2
  return (
    <View
      style={{
        position: 'absolute',
        top: top + offset,
        start: offset,
        zIndex: 2,
      }}
    >
      <PointerTooltip
        label={label}
        style={{ borderRadius: REMOVE_BADGE_SIZE / 2 }}
      >
        <Button
          onPress={onPress}
          accessibilityLabel={label}
          // Reaches in over its item, not out into the gap toward the
          // neighbors' resize handles.
          hitSlop={
            rtl
              ? { bottom: 12, left: 12, top: 4, right: 4 }
              : { bottom: 12, right: 12, top: 4, left: 4 }
          }
          pointerEffect='lift'
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
        </Button>
      </PointerTooltip>
    </View>
  )
}
