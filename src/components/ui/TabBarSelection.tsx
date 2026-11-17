import { useEffect, useRef } from 'react'
import { StyleSheet, View, type TextStyle } from 'react-native'
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated'

import IconButton from '@/components/ui/IconButton'
import LucideIcon, { type AppIcon } from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'

const SELECT_FADE_MS = 180

const fade = (visible: boolean) => ({
  opacity: visible ? 1 : 0,
  transitionProperty: 'opacity',
  transitionDuration: SELECT_FADE_MS,
  transitionTimingFunction: 'ease-in-out' as const,
})

export function TabSelectionBackground({
  selected,
  color,
  borderRadius,
}: {
  selected: boolean
  color: string
  borderRadius: number
}) {
  return (
    <Animated.View
      pointerEvents='none'
      style={[
        StyleSheet.absoluteFill,
        {
          backgroundColor: color,
          borderRadius,
          borderCurve: 'continuous',
        },
        fade(selected),
      ]}
    />
  )
}

export function TabIcon({
  icon,
  size,
  color,
  selectedColor,
  selected,
}: {
  icon: AppIcon
  size: number
  color: string
  selectedColor: string
  selected: boolean
}) {
  const reduceMotion = useReducedMotion()
  const scale = useSharedValue(1)
  const wasSelected = useRef(selected)

  useEffect(() => {
    if (selected && !wasSelected.current && !reduceMotion) {
      scale.value = withSequence(
        withTiming(0.82, { duration: 90, easing: Easing.out(Easing.quad) }),
        withSpring(1, { damping: 9, stiffness: 320, mass: 0.6 })
      )
    }
    wasSelected.current = selected
  }, [reduceMotion, scale, selected])

  const popStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }))

  return (
    <Animated.View style={popStyle}>
      <IconButton icon={icon} size={size} color={color} />
      {selectedColor !== color && (
        <Animated.View
          pointerEvents='none'
          style={[
            StyleSheet.absoluteFill,
            { alignItems: 'center', justifyContent: 'center' },
            fade(selected),
          ]}
        >
          <LucideIcon icon={icon} size={size} color={selectedColor} />
        </Animated.View>
      )}
    </Animated.View>
  )
}

type TextLook = Pick<TextStyle, 'color' | 'fontFamily'>

export function TabLabel({
  label,
  selected,
  look,
  selectedLook,
  fontSize,
  textAlign,
  maxFontSizeMultiplier,
  fill,
}: {
  label: string
  selected: boolean
  look: TextLook
  selectedLook: TextLook
  fontSize: number
  textAlign: TextStyle['textAlign']
  maxFontSizeMultiplier?: number
  fill?: boolean
}) {
  const textProps = {
    numberOfLines: 1,
    adjustsFontSizeToFit: true,
    minimumFontScale: 0.85,
    maxFontSizeMultiplier,
  }

  return (
    <View style={{ flexShrink: 1, flex: fill ? 1 : undefined }}>
      <Animated.View style={fade(selected)}>
        <Text {...textProps} style={{ ...selectedLook, fontSize, textAlign }}>
          {label}
        </Text>
      </Animated.View>
      <Animated.View
        pointerEvents='none'
        accessibilityElementsHidden
        importantForAccessibility='no-hide-descendants'
        style={[StyleSheet.absoluteFill, fade(!selected)]}
      >
        <Text
          {...textProps}
          accessible={false}
          style={{ ...look, fontSize, textAlign }}
        >
          {label}
        </Text>
      </Animated.View>
    </View>
  )
}
