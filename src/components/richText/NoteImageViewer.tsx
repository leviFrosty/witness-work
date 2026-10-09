import { Modal, StatusBar, useWindowDimensions, View } from 'react-native'
import { Image } from 'expo-image'
import * as Sharing from 'expo-sharing'
import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
} from 'react-native-gesture-handler'
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Share as ShareIcon, X as XIcon } from 'lucide-react-native'
import FloatingGlassButton from '@/components/ui/FloatingGlassButton'
import i18n from '@/lib/locales'
import { noteImagePath } from '@/lib/richText/noteImages'
import { useNoteImageUri } from '@/lib/richText/noteImageRevision'
import type { RichTextImageAttrs } from '@/types/richText'

const MAX_SCALE = 6
const DOUBLE_TAP_SCALE = 2.5

/**
 * A note photo, full screen: pinch, pan and double-tap to zoom, and share it
 * (the share sheet also saves it to Photos).
 */
const NoteImageViewer = (props: {
  image: RichTextImageAttrs
  onClose: () => void
}) => {
  const insets = useSafeAreaInsets()
  const window = useWindowDimensions()
  const ratio = props.image.width / props.image.height
  const roomWidth = window.width
  const roomHeight = window.height - insets.top - insets.bottom - 120
  const fit =
    roomWidth / roomHeight > ratio
      ? { width: roomHeight * ratio, height: roomHeight }
      : { width: roomWidth, height: roomWidth / ratio }

  const scale = useSharedValue(1)
  const savedScale = useSharedValue(1)
  const tx = useSharedValue(0)
  const ty = useSharedValue(0)
  const savedTx = useSharedValue(0)
  const savedTy = useSharedValue(0)

  const clamp = (s: number, x: number, y: number) => {
    'worklet'
    const overflowX = Math.max(0, (fit.width * s - fit.width) / 2)
    const overflowY = Math.max(0, (fit.height * s - fit.height) / 2)
    return {
      x: Math.min(overflowX, Math.max(-overflowX, x)),
      y: Math.min(overflowY, Math.max(-overflowY, y)),
    }
  }

  const pan = Gesture.Pan()
    .enableTrackpadTwoFingerGesture(true)
    .onUpdate((event) => {
      const next = clamp(
        scale.value,
        savedTx.value + event.translationX,
        savedTy.value + event.translationY
      )
      tx.value = next.x
      ty.value = next.y
    })
    .onEnd(() => {
      savedTx.value = tx.value
      savedTy.value = ty.value
    })

  const pinch = Gesture.Pinch()
    .onUpdate((event) => {
      const next = Math.max(
        1,
        Math.min(MAX_SCALE, savedScale.value * event.scale)
      )
      scale.value = next
      const moved = clamp(next, savedTx.value, savedTy.value)
      tx.value = moved.x
      ty.value = moved.y
    })
    .onEnd(() => {
      savedScale.value = scale.value
      savedTx.value = tx.value
      savedTy.value = ty.value
    })

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => {
      const target = scale.value > 1.05 ? 1 : DOUBLE_TAP_SCALE
      scale.value = withTiming(target, { duration: 220 })
      tx.value = withTiming(0, { duration: 220 })
      ty.value = withTiming(0, { duration: 220 })
      savedScale.value = target
      savedTx.value = 0
      savedTy.value = 0
    })

  const gesture = Gesture.Race(doubleTap, Gesture.Simultaneous(pan, pinch))

  const imageStyle = useAnimatedStyle(() => ({
    width: fit.width,
    height: fit.height,
    transform: [
      { translateX: tx.value },
      { translateY: ty.value },
      { scale: scale.value },
    ],
  }))

  const uri = useNoteImageUri(props.image.id)
  const sharePath = noteImagePath(props.image.id)

  return (
    <Modal
      visible
      transparent
      animationType='fade'
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={props.onClose}
    >
      <StatusBar barStyle='light-content' />
      <GestureHandlerRootView style={{ flex: 1, backgroundColor: '#000' }}>
        <View
          style={{
            position: 'absolute',
            top: insets.top + 6,
            left: 0,
            right: 0,
            paddingHorizontal: 16,
            flexDirection: 'row',
            justifyContent: 'space-between',
            zIndex: 10,
          }}
        >
          <FloatingGlassButton
            icon={XIcon}
            onPress={props.onClose}
            label={i18n.t('close')}
          />
          <FloatingGlassButton
            icon={ShareIcon}
            onPress={() => {
              void Sharing.shareAsync(sharePath, {
                mimeType: 'image/jpeg',
              }).catch(() => {})
            }}
            label={i18n.t('sharePhoto')}
          />
        </View>
        <GestureDetector gesture={gesture}>
          <View
            style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}
          >
            <Animated.View style={imageStyle}>
              <Image
                source={{ uri }}
                style={{ width: '100%', height: '100%' }}
                contentFit='contain'
                accessibilityLabel={i18n.t('richText_photo')}
              />
            </Animated.View>
          </View>
        </GestureDetector>
      </GestureHandlerRootView>
    </Modal>
  )
}

export default NoteImageViewer
