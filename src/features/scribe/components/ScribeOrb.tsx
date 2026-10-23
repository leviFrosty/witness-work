import { useEffect, useRef } from 'react'
import { type StyleProp, View, type ViewStyle } from 'react-native'
import { Canvas, Fill, Shader } from '@shopify/react-native-skia'
import { useIsFocused } from '@react-navigation/native'
import Animated, {
  useAnimatedStyle,
  useDerivedValue,
  useFrameCallback,
  useReducedMotion,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated'
import useTheme from '@/contexts/theme'
import useAppActive from '@/hooks/useAppActive'
import useOnScreen from '@/hooks/useOnScreen'
import { orbShader } from '@/features/scribe/shaders/orbShader'
import { orbPalette } from '@/features/scribe/shaders/orbPalette'

export type ScribeOrbState = 'idle' | 'listening' | 'organizing' | 'disabled'

interface Props {
  /** Canvas size; the sphere is `core` of it and the rest is glow. */
  size: number
  state: ScribeOrbState
  /** 0–1 voice level from the capture; drives the orb while listening. */
  level?: SharedValue<number>
  /** Offline: grey and still, like `disabled`. */
  offline?: boolean
  /** Core radius as a fraction of the canvas. */
  core?: number
  /** Makes the orb one accessible element with this (state) label. */
  accessibilityLabel?: string
  /**
   * In a scroll view (Home): stop drawing while scrolled out of the window.
   * Elsewhere leave it off; measuring a view that is going away warns.
   */
  pausesOffscreen?: boolean
  style?: StyleProp<ViewStyle>
}

const CROSSFADE_MS = 450

/**
 * The Scribe AI orb: a Skia shader on the UI thread that breathes when idle,
 * swells and ripples with the voice level (fast attack, slow release), and
 * shrinks into a circling ring while organizing. It stops drawing while its
 * screen is covered or blurred, the app is in the background, or (with
 * `pausesOffscreen`) it has scrolled out of the window, so Home pays nothing
 * for it when it's out of sight. Reduce Motion swaps it for a still ring whose
 * opacity and width follow the level; a shader that fails to compile falls back
 * to a plain circle.
 */
const ScribeOrb = ({
  size,
  state,
  level,
  offline = false,
  core = 0.27,
  accessibilityLabel,
  pausesOffscreen = false,
  style,
}: Props) => {
  const theme = useTheme()
  const reduceMotion = useReducedMotion()
  const focused = useIsFocused()
  const appActive = useAppActive()
  const ref = useRef<View>(null)
  const palette = orbPalette(theme)
  const muted = offline || state === 'disabled'
  const listening = state === 'listening'

  const time = useSharedValue(2.35)
  const smooth = useSharedValue(0)
  const proc = useSharedValue(state === 'organizing' ? 1 : 0)
  const mute = useSharedValue(muted ? 1 : 0)

  useEffect(() => {
    proc.value = withTiming(state === 'organizing' ? 1 : 0, {
      duration: reduceMotion ? 0 : 650,
    })
    mute.value = withTiming(muted ? 1 : 0, {
      duration: reduceMotion ? 0 : CROSSFADE_MS,
    })
  }, [state, muted, reduceMotion, proc, mute])

  // A still orb (offline, disabled) needs no frames; neither does one nobody
  // can see.
  const visible = focused && appActive && !muted
  const onScreen = useOnScreen(ref, visible && pausesOffscreen)
  const running = visible && (!pausesOffscreen || onScreen)
  const frameCallback = useFrameCallback(({ timeSincePreviousFrame }) => {
    'worklet'
    const dt = Math.min(timeSincePreviousFrame ?? 16, 64) / 1000
    if (!reduceMotion) time.value += dt
    const target = listening && level ? level.value : 0
    if (Math.abs(target - smooth.value) > 0.001) {
      const k = target > smooth.value ? 0.35 : 0.07
      smooth.value += (target - smooth.value) * k
    }
  }, false)

  useEffect(() => {
    frameCallback.setActive(running)
  }, [running, frameCallback])

  const uniforms = useDerivedValue(() => ({
    uSize: [size, size],
    uTime: time.value,
    uLevel: smooth.value,
    uProc: proc.value,
    uMute: mute.value,
    uCore: core,
    uA: palette.a,
    uB: palette.b,
    uC: palette.c,
    uD: palette.d,
  }))

  const coreSize = size * core * 2
  const ringSize = coreSize * 1.36
  const ringStyle = useAnimatedStyle(() => ({
    opacity: (0.35 + 0.65 * smooth.value) * (1 - mute.value * 0.6),
    borderWidth: 2 + 5 * smooth.value,
  }))
  const coreStyle = useAnimatedStyle(() => ({
    opacity: 1 - mute.value * 0.55,
    transform: [{ scale: 1 - 0.3 * proc.value }],
  }))

  const accessible = accessibilityLabel !== undefined
  const coreColor = muted ? theme.colors.textAlt : theme.colors.accent

  return (
    <Animated.View
      ref={ref}
      accessible={accessible}
      accessibilityLabel={accessibilityLabel}
      importantForAccessibility={accessible ? 'yes' : 'no-hide-descendants'}
      pointerEvents='none'
      style={[{ width: size, height: size }, style]}
    >
      {reduceMotion || !orbShader ? (
        <View
          style={{
            flex: 1,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {reduceMotion && (
            <Animated.View
              style={[
                {
                  position: 'absolute',
                  width: ringSize,
                  height: ringSize,
                  borderRadius: ringSize / 2,
                  borderColor: coreColor,
                },
                ringStyle,
              ]}
            />
          )}
          <Animated.View
            style={[
              {
                width: coreSize,
                height: coreSize,
                borderRadius: coreSize / 2,
                backgroundColor: coreColor,
              },
              coreStyle,
            ]}
          />
        </View>
      ) : (
        <Canvas style={{ width: size, height: size }}>
          <Fill>
            <Shader source={orbShader} uniforms={uniforms} />
          </Fill>
        </Canvas>
      )}
    </Animated.View>
  )
}

export default ScribeOrb
