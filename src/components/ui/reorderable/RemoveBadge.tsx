import { View } from 'react-native'
import Button from '@/components/ui/Button'
import PointerTooltip from '@/components/ui/PointerTooltip'
import { MIN_TOUCH_TARGET } from '@/components/ui/touchTarget'
import useTheme from '@/contexts/theme'

export const REMOVE_BADGE_SIZE = 24

const OUTSET = 4

export const cornerInset = (radius: number) => radius * (1 - Math.SQRT1_2)

export const removeBadgeTargetInset = (radius: number) =>
  cornerInset(radius) - REMOVE_BADGE_SIZE / 2 - OUTSET + MIN_TOUCH_TARGET / 2

export default function RemoveBadge({
  label,
  onPress,
  radius,
  top = 0,
}: {
  label: string
  onPress: () => void

  radius: number

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
      {}
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
