import { Pressable, StyleSheet, View } from 'react-native'
import { BlurView } from 'expo-blur'
import { GlassView } from 'expo-glass-effect'
import LucideIcon, { type AppIcon } from '@/components/ui/LucideIcon'
import PointerHover from '@/components/ui/PointerHover'

const HEADER_BUTTON_SIZE = 40

/**
 * Round glass header button. Floats over imagery so we layer a `BlurView`
 * underneath the `GlassView` per AGENTS.md guidance ("free-floating elements
 * that would visually disappear without the material") — on iOS 26 the
 * `GlassView` paints over the blur fallback; on older systems the blur stays
 * visible so the icon doesn't disappear into the photo behind it.
 */
const FloatingGlassButton = ({
  icon,
  onPress,
  label,
}: {
  icon: AppIcon
  onPress: () => void
  label: string
}) => {
  const shape = {
    width: HEADER_BUTTON_SIZE,
    height: HEADER_BUTTON_SIZE,
    borderRadius: HEADER_BUTTON_SIZE / 2,
    overflow: 'hidden' as const,
  }
  return (
    <PointerHover effect='highlight'>
      <Pressable
        onPress={onPress}
        accessibilityLabel={label}
        accessibilityRole='button'
        hitSlop={10}
        style={{ borderRadius: shape.borderRadius }}
      >
        <View style={shape}>
          <BlurView
            tint='systemThickMaterialDark'
            intensity={50}
            style={StyleSheet.absoluteFill}
          />
          <GlassView
            glassEffectStyle='regular'
            colorScheme='dark'
            style={StyleSheet.absoluteFill}
          />
          <View
            style={{
              ...shape,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: 'transparent',
            }}
          >
            <LucideIcon icon={icon} size={16} color='#fff' />
          </View>
        </View>
      </Pressable>
    </PointerHover>
  )
}

export default FloatingGlassButton
