import { useState } from 'react'
import { Pressable, View } from 'react-native'
import AppIconImage from '@/components/AppIconImage'
import PointerHover, { HoverTint } from '@/components/ui/PointerHover'
import Spinner from '@/components/ui/Spinner'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'

const RING_WIDTH = 3
const RING_GAP = 3
export const TILE_INSET = RING_WIDTH + RING_GAP
const CORNER_RATIO = 0.225

type Props = {
  label: string

  preview: number

  size: number
  selected: boolean
  pending: boolean
  disabled: boolean
  onPress: () => void
}

const AppIconTile = ({
  label,
  preview,
  size,
  selected,
  pending,
  disabled,
  onPress,
}: Props) => {
  const theme = useTheme()
  const [hovered, setHovered] = useState(false)
  const iconRadius = size * CORNER_RATIO

  return (
    <PointerHover enabled={!disabled} onHoverChange={setHovered}>
      <Pressable
        onPress={onPress}
        disabled={disabled}
        accessibilityRole='button'
        accessibilityState={{ selected, busy: pending }}
        accessibilityLabel={label}
        style={({ pressed }) => ({
          width: size + TILE_INSET * 2,
          alignItems: 'center',
          gap: 6,
          opacity: disabled && !pending ? 0.5 : 1,
          transform: [{ scale: pressed ? 0.95 : 1 }],
        })}
      >
        <View
          style={{
            padding: RING_GAP,
            borderWidth: RING_WIDTH,
            borderRadius: iconRadius + TILE_INSET,
            borderCurve: 'continuous',
            borderColor: selected ? theme.colors.accent : 'transparent',
          }}
        >
          <AppIconImage source={preview} size={size} />
          {pending && (
            <View
              style={{
                position: 'absolute',
                top: RING_GAP,
                left: RING_GAP,
                right: RING_GAP,
                bottom: RING_GAP,
                borderRadius: iconRadius,
                borderCurve: 'continuous',
                backgroundColor: 'rgba(0,0,0,0.35)',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Spinner color='#FFFFFF' />
            </View>
          )}
          <View
            pointerEvents='none'
            style={{
              position: 'absolute',
              top: RING_GAP,
              left: RING_GAP,
              right: RING_GAP,
              bottom: RING_GAP,
            }}
          >
            <HoverTint
              visible={hovered}
              borderRadius={iconRadius}
              borderCurve='continuous'
            />
          </View>
        </View>
        <Text
          numberOfLines={1}
          style={{
            fontSize: theme.fontSize('xs'),
            fontFamily: selected ? theme.fonts.semiBold : theme.fonts.regular,
            color: selected ? theme.colors.accent : theme.colors.text,
          }}
        >
          {label}
        </Text>
      </Pressable>
    </PointerHover>
  )
}

export default AppIconTile
