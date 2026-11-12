import { useEffect, useState } from 'react'
import { View } from 'react-native'
import { Image } from 'expo-image'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated'
import { RotateCw as RotateCwIcon } from 'lucide-react-native'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import TerritoryPill from '@/features/territories/components/TerritoryPill'
import { cardPhotoUri } from '@/features/territories/lib/cardPhoto'
import { fitInside, type Size } from '@/features/territories/lib/cardPhotoFit'
import {
  aroundPoint,
  cardPhotoViewForDev,
  fitScale,
  isStartView,
  keepInRoom,
  nextQuarterTurn,
  normalizeAngle,
  type PhotoView,
  type Point,
  START_VIEW,
} from '@/features/territories/lib/cardPhotoTurn'

const MIN_SCALE = 0.5
const MAX_SCALE = 6
const DOUBLE_TAP_SCALE = 2.5
const EASE = { duration: 220 }

export default function TerritoryCardPhotoViewer({
  photo,
  inset,
}: {
  photo: string
  inset: { top: number; bottom: number }
}) {
  const theme = useTheme()
  const [room, setRoom] = useState<Size | null>(null)
  const [ratio, setRatio] = useState(3 / 2)
  const space = room ?? { width: 0, height: 0 }
  const fit = room ? fitInside(room, ratio) : { width: 0, height: 0 }

  const x = useSharedValue(0)
  const y = useSharedValue(0)
  const scale = useSharedValue(1)
  const angle = useSharedValue(0)
  const active = useSharedValue(0)
  const lastPan = useSharedValue({ x: 0, y: 0 })
  const lastPinch = useSharedValue(1)
  const lastTurn = useSharedValue(0)

  const current = (): PhotoView => {
    'worklet'
    return { x: x.value, y: y.value, scale: scale.value, angle: angle.value }
  }
  const place = (view: PhotoView) => {
    'worklet'
    x.value = view.x
    y.value = view.y
    scale.value = view.scale
    angle.value = view.angle
  }
  const glide = (view: PhotoView) => {
    'worklet'
    x.value = withTiming(view.x, EASE)
    y.value = withTiming(view.y, EASE)
    scale.value = withTiming(view.scale, EASE)
    angle.value = withTiming(view.angle, EASE)
  }
  const fromCenter = (focalX: number, focalY: number): Point => {
    'worklet'
    return { x: focalX - space.width / 2, y: focalY - space.height / 2 }
  }
  const began = () => {
    'worklet'
    active.value += 1
  }
  const ended = () => {
    'worklet'
    active.value = Math.max(0, active.value - 1)
    if (active.value > 0) return
    const kept = keepInRoom(current(), fit, space)
    x.value = withTiming(kept.x, EASE)
    y.value = withTiming(kept.y, EASE)
  }

  const pan = Gesture.Pan()
    .enableTrackpadTwoFingerGesture(true)
    .onStart(() => {
      lastPan.value = { x: 0, y: 0 }
      began()
    })
    .onUpdate((event) => {
      x.value += event.translationX - lastPan.value.x
      y.value += event.translationY - lastPan.value.y
      lastPan.value = { x: event.translationX, y: event.translationY }
    })
    .onEnd(ended)

  const pinch = Gesture.Pinch()
    .onStart(() => {
      lastPinch.value = 1
      began()
    })
    .onUpdate((event) => {
      const wanted = scale.value * (event.scale / lastPinch.value)
      const bounded = Math.min(MAX_SCALE, Math.max(MIN_SCALE, wanted))
      lastPinch.value = event.scale
      place(
        aroundPoint(
          current(),
          fromCenter(event.focalX, event.focalY),
          bounded / scale.value,
          0
        )
      )
    })
    .onEnd(ended)

  const rotation = Gesture.Rotation()
    .onStart(() => {
      lastTurn.value = 0
      began()
    })
    .onUpdate((event) => {
      const turn = event.rotation - lastTurn.value
      lastTurn.value = event.rotation
      place(
        aroundPoint(
          current(),
          fromCenter(event.anchorX, event.anchorY),
          1,
          turn
        )
      )
    })
    .onEnd(ended)

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => {
      if (isStartView(current())) {
        glide({ ...START_VIEW, scale: DOUBLE_TAP_SCALE })
        return
      }
      angle.value = normalizeAngle(angle.value)
      glide(START_VIEW)
    })

  const gesture = Gesture.Race(
    doubleTap,
    Gesture.Simultaneous(pan, pinch, rotation)
  )

  const imageStyle = useAnimatedStyle(() => ({
    width: fit.width,
    height: fit.height,
    transform: [
      { translateX: x.value },
      { translateY: y.value },
      { scale: scale.value },
      { rotate: `${angle.value}rad` },
    ],
  }))

  const turn = () => {
    const next = nextQuarterTurn(angle.value)
    glide({ x: 0, y: 0, scale: fitScale(fit, space, next), angle: next })
  }

  useEffect(() => {
    if (!__DEV__) return
    cardPhotoViewForDev.attach(place)
    return () => cardPhotoViewForDev.attach(null)
  })

  return (
    <View
      testID='territory-card-photo-viewer'
      style={{ flex: 1, paddingTop: inset.top, paddingBottom: inset.bottom }}
    >
      <GestureDetector gesture={gesture}>
        <View
          onLayout={(event) => {
            const { width, height } = event.nativeEvent.layout
            setRoom((was) =>
              was?.width === width && was.height === height
                ? was
                : { width, height }
            )
          }}
          style={{
            flex: 1,
            overflow: 'hidden',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Animated.View style={imageStyle}>
            <Image
              source={{ uri: cardPhotoUri(photo) }}
              onLoad={(event) => {
                const { width, height } = event.source
                if (width > 0 && height > 0) setRatio(width / height)
              }}
              style={{ width: '100%', height: '100%' }}
              contentFit='contain'
              accessibilityLabel={i18n.t('territories.cardPhoto')}
              accessibilityHint={i18n.t('territories.map.cardPhoto_hint')}
            />
          </Animated.View>
        </View>
      </GestureDetector>
      {room && (
        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'flex-end',
            paddingHorizontal: 20,
            paddingTop: 8,
          }}
        >
          <TerritoryPill
            icon={RotateCwIcon}
            iconColor={theme.colors.text}
            label={i18n.t('territories.map.cardPhoto_turn')}
            onPress={turn}
            testID='territory-card-photo-turn'
          />
        </View>
      )}
    </View>
  )
}
