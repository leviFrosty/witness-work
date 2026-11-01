import { useEffect } from 'react'
import { PixelRatio, View } from 'react-native'
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated'
import {
  Canvas,
  FilterMode,
  Image,
  MipmapMode,
  type SkImage,
} from '@shopify/react-native-skia'
import i18n from '@/lib/locales'
import { createLru } from '@/lib/pixelArt'
import {
  HEART_ICON_H,
  HEART_ICON_W,
  HEART_MAIN,
  heartIcon,
  HEARTS_ROW_W,
  heartsRow,
} from '@/features/pet/art'
import type { HeartPulse } from '@/features/pet/hooks/usePetReveal'
import { crispScale } from '@/features/pet/render/crispScale'
import { bufferToSkImage } from '@/features/pet/render/skiaImage'

const SAMPLING = { filter: FilterMode.Nearest, mipmap: MipmapMode.None }

const rows = createLru<SkImage | null>(24)

function heartsImage(hearts: number, gold: boolean): SkImage | null {
  return rows.getOrCreate(`${hearts}|${gold ? 1 : 0}`, () =>
    bufferToSkImage(heartsRow(hearts, gold))
  )
}

const fullHeart = (gold: boolean) =>
  rows.getOrCreate(`full|${gold ? 1 : 0}`, () =>
    bufferToSkImage(heartIcon(1, gold))
  )

const HEART_PITCH = (HEARTS_ROW_W - HEART_ICON_W) / 4

export default function PixelHearts({
  hearts,
  gold = false,
  height = 10,
  pulse = null,
}: {
  hearts: number
  gold?: boolean

  height?: number
  pulse?: HeartPulse | null
}) {
  const scale = crispScale(height, HEART_ICON_H, PixelRatio.get())
  const width = HEARTS_ROW_W * scale
  const h = HEART_ICON_H * scale
  const shake = useSharedValue(0)
  useEffect(() => {
    if (!pulse || pulse.up) return
    shake.value = withSequence(
      withTiming(-scale, { duration: 50 }),
      withTiming(scale, { duration: 70 }),
      withTiming(-scale / 2, { duration: 60 }),
      withTiming(0, { duration: 50 })
    )
  }, [pulse, shake, scale])
  const shakeStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: shake.value }],
  }))

  return (
    <View
      accessible
      accessibilityRole='image'
      accessibilityLabel={i18n.t('pet.a11y.hearts', { count: hearts })}
      style={{ width, height: h }}
    >
      <Animated.View style={[{ width, height: h }, shakeStyle]}>
        <Canvas style={{ width, height: h }} pointerEvents='none'>
          <Image
            image={heartsImage(hearts, gold)}
            x={0}
            y={0}
            width={width}
            height={h}
            sampling={SAMPLING}
          />
        </Canvas>
      </Animated.View>
      {pulse ? (
        <HeartChange
          key={pulse.id}
          left={pulse.index * HEART_PITCH * scale}
          up={pulse.up}
          gold={gold}
          scale={scale}
        />
      ) : null}
    </View>
  )
}

function HeartChange({
  left,
  up,
  gold,
  scale,
}: {
  left: number
  up: boolean
  gold: boolean
  scale: number
}) {
  const progress = useSharedValue(0)
  useEffect(() => {
    progress.value = withTiming(1, {
      duration: up ? 420 : 620,
      easing: up ? Easing.out(Easing.cubic) : Easing.in(Easing.quad),
    })
  }, [progress, up])
  const popStyle = useAnimatedStyle(() => ({
    opacity: 0.9 * (1 - progress.value),
    transform: [{ scale: 1 + progress.value }],
  }))
  const w = HEART_ICON_W * scale
  const h = HEART_ICON_H * scale
  if (up)
    return (
      <Animated.View
        pointerEvents='none'
        style={[
          { position: 'absolute', left, top: 0, width: w, height: h },
          popStyle,
        ]}
      >
        <Canvas style={{ width: w, height: h }}>
          <Image
            image={fullHeart(gold)}
            x={0}
            y={0}
            width={w}
            height={h}
            sampling={SAMPLING}
          />
        </Canvas>
      </Animated.View>
    )
  return (
    <View
      pointerEvents='none'
      style={{ position: 'absolute', left: left + 2 * scale, top: h / 2 }}
    >
      {[-1, 0, 1].map((side) => (
        <Crumb
          key={side}
          side={side}
          progress={progress}
          scale={scale}
          color={gold ? HEART_MAIN.gold : HEART_MAIN.red}
        />
      ))}
    </View>
  )
}

function Crumb({
  side,
  progress,
  scale,
  color,
}: {
  side: number
  progress: ReturnType<typeof useSharedValue<number>>
  scale: number
  color: string
}) {
  const style = useAnimatedStyle(() => ({
    opacity: 1 - progress.value,
    transform: [
      { translateX: side * 4 * scale * progress.value },
      { translateY: 5 * scale * progress.value * (1 + Math.abs(side) / 3) },
    ],
  }))
  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          left: side * scale,
          width: scale,
          height: scale,
          backgroundColor: color,
        },
        style,
      ]}
    />
  )
}
