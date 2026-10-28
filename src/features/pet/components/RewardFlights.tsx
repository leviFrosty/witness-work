import { useEffect, useState, type RefObject } from 'react'
import { StyleSheet, View } from 'react-native'
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated'
import type { Viewport } from '@/lib/pixelArt'
import { petCenterIn } from '@/features/pet/art'
import { COIN_ICON_PX } from '@/features/pet/art/shop'
import { CoinIcon } from '@/features/pet/components/ShopPixels'
import {
  FLIGHT_MS,
  FLIGHT_STAGGER_MS,
  type GainPulse,
} from '@/features/pet/hooks/usePetReveal'
import { REVEAL_FLIGHTS } from '@/features/pet/lib/reveal'

type Point = { x: number; y: number }
type Measurable = RefObject<Pick<View, 'measureInWindow'> | null>

const measure = (ref: Measurable) =>
  new Promise<{ x: number; y: number; w: number; h: number } | null>(
    (resolve) => {
      if (!ref.current) return resolve(null)
      ref.current.measureInWindow((x, y, w, h) =>
        resolve(w > 0 && h > 0 ? { x, y, w, h } : null)
      )
    }
  )

/**
 * What a gain brings, pixel coins flying from the pet to its count, more of
 * them the bigger the gain (`REVEAL_FLIGHTS`). Fills its parent, which
 * `containerRef` measures, and takes no touches.
 */
export default function RewardFlights({
  pulse,
  containerRef,
  sceneRef,
  viewport,
  iconRef,
  iconScale,
}: {
  pulse: GainPulse | null
  containerRef: Measurable
  /** The pet's scene, showing `viewport`. */
  sceneRef: Measurable
  viewport: Viewport
  iconRef: Measurable
  iconScale: number
}) {
  return (
    <View pointerEvents='none' style={StyleSheet.absoluteFill}>
      {pulse && REVEAL_FLIGHTS[pulse.tier] ? (
        <Burst
          key={pulse.id}
          count={REVEAL_FLIGHTS[pulse.tier]}
          containerRef={containerRef}
          sceneRef={sceneRef}
          viewport={viewport}
          iconRef={iconRef}
          iconScale={iconScale}
        />
      ) : null}
    </View>
  )
}

function Burst({
  count,
  containerRef,
  sceneRef,
  viewport,
  iconRef,
  iconScale,
}: {
  count: number
  containerRef: Measurable
  sceneRef: Measurable
  viewport: Viewport
  iconRef: Measurable
  iconScale: number
}) {
  const [path, setPath] = useState<{ from: Point; to: Point } | null>(null)
  useEffect(() => {
    let live = true
    void Promise.all([
      measure(containerRef),
      measure(sceneRef),
      measure(iconRef),
    ]).then(([box, scene, icon]) => {
      if (!live || !box || !scene || !icon) return
      const [fx, fy] = petCenterIn(viewport)
      setPath({
        from: {
          x: scene.x - box.x + scene.w * fx,
          y: scene.y - box.y + scene.h * fy,
        },
        to: { x: icon.x - box.x + icon.w / 2, y: icon.y - box.y + icon.h / 2 },
      })
    })
    return () => {
      live = false
    }
  }, [containerRef, sceneRef, iconRef, viewport])
  if (!path) return null
  return Array.from({ length: count }, (_, i) => (
    <Flight
      key={i}
      from={path.from}
      to={path.to}
      delay={i * FLIGHT_STAGGER_MS}
      // Each leaves a little to the side of the last, so they fan out.
      lean={(i % 2 ? -1 : 1) * Math.ceil(i / 2) * 10}
      iconScale={iconScale}
    />
  ))
}

function Flight({
  from,
  to,
  delay,
  lean,
  iconScale,
}: {
  from: Point
  to: Point
  delay: number
  lean: number
  iconScale: number
}) {
  const progress = useSharedValue(0)
  useEffect(() => {
    progress.value = withDelay(
      delay,
      withTiming(1, {
        duration: FLIGHT_MS,
        easing: Easing.inOut(Easing.quad),
      })
    )
  }, [progress, delay])
  const size = COIN_ICON_PX.small * iconScale
  const lift = 40 + Math.abs(to.x - from.x) * 0.15
  const style = useAnimatedStyle(() => {
    const p = progress.value
    const arc = Math.sin(Math.PI * p)
    return {
      opacity: interpolate(p, [0, 0.08, 0.95, 1], [0, 1, 1, 0]),
      transform: [
        { translateX: from.x + (to.x - from.x) * p + lean * arc - size / 2 },
        { translateY: from.y + (to.y - from.y) * p - lift * arc - size / 2 },
        { scale: interpolate(p, [0, 0.2, 0.6, 1], [0.4, 1, 1.15, 0.9]) },
      ],
    }
  })
  return (
    <Animated.View style={[{ position: 'absolute', left: 0, top: 0 }, style]}>
      <CoinIcon scale={iconScale} />
    </Animated.View>
  )
}
