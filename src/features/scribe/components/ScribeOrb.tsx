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
  withDelay,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated'
import useTheme from '@/contexts/theme'
import useAppActive from '@/hooks/useAppActive'
import useOnScreen from '@/hooks/useOnScreen'
import { orbShader } from '@/features/scribe/shaders/orbShader'
import { orbPalette } from '@/features/scribe/shaders/orbPalette'

export type ScribeOrbState =
  | 'idle'
  | 'loading'
  | 'listening'
  | 'organizing'
  | 'disabled'

interface Props {
  size: number
  state: ScribeOrbState

  level?: SharedValue<number>

  offline?: boolean

  core?: number

  accessibilityLabel?: string

  pausesOffscreen?: boolean
  style?: StyleProp<ViewStyle>
}

const CROSSFADE_MS = 450

const POP_MS = 110
const GROW_DELAY_MS = 160
const GROW_SPRING = { damping: 13, stiffness: 190, mass: 0.9 }

const LEVEL_RISE = 0.06
const LEVEL_FALL = 0.26
const LEVEL_GLIDE = 0.07

const FLOW_BASE = 0.22
const FLOW_VOICE = 0.3

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
  const loading = state === 'loading'

  const time = useSharedValue(2.35)
  const flow = useSharedValue(2.35 * FLOW_BASE)
  const listen = useSharedValue(state === 'listening' ? 1 : 0)
  const rough = useSharedValue(0)
  const smooth = useSharedValue(0)
  const proc = useSharedValue(state === 'organizing' ? 1 : 0)
  const mute = useSharedValue(muted ? 1 : 0)
  const load = useSharedValue(loading ? 1 : 0)
  const pop = useSharedValue(loading ? 0 : 1)
  const grow = useSharedValue(loading ? 0 : 1)

  useEffect(() => {
    listen.value = state === 'listening' ? 1 : 0
    proc.value = withTiming(state === 'organizing' ? 1 : 0, {
      duration: reduceMotion ? 0 : 650,
    })
    mute.value = withTiming(muted ? 1 : 0, {
      duration: reduceMotion ? 0 : CROSSFADE_MS,
    })
  }, [state, muted, reduceMotion, listen, proc, mute])

  useEffect(() => {
    if (loading) {
      load.value = 1
      pop.value = 0
      grow.value = 0
      return
    }
    if (pop.value === 1) return
    if (reduceMotion) {
      load.value = withTiming(0, { duration: CROSSFADE_MS })
      pop.value = 1
      grow.value = 1
      return
    }
    load.value = withTiming(0, { duration: POP_MS })
    pop.value = withTiming(1, { duration: POP_MS })
    grow.value = withDelay(GROW_DELAY_MS, withSpring(1, GROW_SPRING))
  }, [loading, reduceMotion, load, pop, grow])

  const visible = focused && appActive && !muted
  const onScreen = useOnScreen(ref, visible && pausesOffscreen)
  const running = visible && (!pausesOffscreen || onScreen)
  const frameCallback = useFrameCallback(({ timeSincePreviousFrame }) => {
    'worklet'
    const dt = Math.min(timeSincePreviousFrame ?? 16, 64) / 1000
    if (!reduceMotion) time.value += dt
    const target = listen.value === 1 && level ? level.value : 0
    if (
      Math.abs(target - rough.value) > 0.0005 ||
      Math.abs(rough.value - smooth.value) > 0.0005
    ) {
      const tau = target > rough.value ? LEVEL_RISE : LEVEL_FALL
      rough.value += (target - rough.value) * (1 - Math.exp(-dt / tau))
      smooth.value +=
        (rough.value - smooth.value) * (1 - Math.exp(-dt / LEVEL_GLIDE))
    }
    if (!reduceMotion)
      flow.value += dt * (FLOW_BASE + FLOW_VOICE * smooth.value)
  }, false)

  useEffect(() => {
    frameCallback.setActive(running)
  }, [running, frameCallback])

  const uniforms = useDerivedValue(() => ({
    uSize: [size, size],
    uTime: time.value,
    uFlow: flow.value,
    uLevel: smooth.value,
    uLoad: load.value,
    uPop: pop.value,
    uGrow: grow.value,
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
    opacity: (1 - mute.value * 0.55) * (1 - 0.6 * load.value),
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
