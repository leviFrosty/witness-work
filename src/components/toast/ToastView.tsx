import { useEffect, useRef, useState } from 'react'
import { AccessibilityInfo, View } from 'react-native'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated'
import { scheduleOnRN } from 'react-native-worklets'
import useTheme from '@/contexts/theme'
import PointerHover from '@/components/ui/PointerHover'
import ToastContent, { toastSurface } from '@/components/toast/ToastContent'
import Haptics from '@/lib/haptics'
import i18n from '@/lib/locales'
import { toastDuration } from '@/lib/toastDuration'
import type { Toast, ToastCloseReason, ToastPlacement } from '@/stores/toasts'

export const TOAST_PEEK = 10

export const TOAST_GAP = 10

export const VISIBLE_BEHIND = 2

const MOVE = { duration: 400, easing: Easing.bezier(0.21, 1.02, 0.73, 1) }
const LEAVE = { duration: 220, easing: Easing.in(Easing.quad) }

const SWIPE_DISTANCE = 45
const SWIPE_VELOCITY = 600

export type ToastLeave = {
  reason: ToastCloseReason

  fling?: { x: number; y: number }
}

type Props = {
  toast: Toast
  placement: ToastPlacement

  index: number | null
  expanded: boolean

  frontHeight: number

  y: number

  height: number | undefined

  hidden: boolean

  paused: boolean
  reduceMotion: boolean
  screenReader: boolean
  leaving: ToastLeave | null
  onMeasure: (id: number, height: number) => void
  onLeave: (id: number, leave: ToastLeave) => void

  onExited: (id: number, reason: ToastCloseReason) => void
  onTouch: (touching: boolean) => void
  onExpand: () => void
}

export default function ToastView({
  toast,
  placement,
  index,
  expanded,
  frontHeight,
  y: stackY,
  height,
  hidden,
  paused,
  reduceMotion,
  screenReader,
  leaving,
  onMeasure,
  onLeave,
  onExited,
  onTouch,
  onExpand,
}: Props) {
  const theme = useTheme()
  const [hovered, setHovered] = useState(false)

  const lift = placement === 'top' ? 1 : -1
  const measured = height !== undefined
  const front = index === 0

  const collapsedBehind = !expanded && index !== null && index > 0
  const readable = !hidden && index !== null && !collapsedBehind

  const y = useSharedValue(0)
  const scale = useSharedValue(1)
  const opacity = useSharedValue(0)
  const contentOpacity = useSharedValue(1)
  const cardHeight = useSharedValue(0)
  const dragX = useSharedValue(0)
  const dragY = useSharedValue(0)
  const entered = useRef(false)

  useEffect(() => {
    if (!measured || hidden || leaving || index === null) return
    const collapsedBehind = !expanded && index > 0
    const targetY = stackY
    const targetScale = expanded ? 1 : 1 - 0.05 * index
    const targetHeight = collapsedBehind ? frontHeight : height
    const shown = expanded ? index <= 4 : index <= VISIBLE_BEHIND
    const timing = reduceMotion ? { duration: 0 } : MOVE
    if (!entered.current) {
      entered.current = true
      y.value = reduceMotion ? targetY : -lift * (height + 24)
      scale.value = targetScale
      cardHeight.value = targetHeight
      contentOpacity.value = collapsedBehind ? 0 : 1
    }
    y.value = withTiming(targetY, timing)
    scale.value = withTiming(targetScale, timing)
    cardHeight.value = withTiming(targetHeight, timing)
    opacity.value = withTiming(shown ? 1 : 0, reduceMotion ? MOVE : timing)
    contentOpacity.value = withTiming(collapsedBehind ? 0 : 1, {
      duration: 200,
    })
  }, [
    measured,
    hidden,
    leaving,
    index,
    expanded,
    stackY,
    frontHeight,
    height,
    lift,
    reduceMotion,
    y,
    scale,
    cardHeight,
    opacity,
    contentOpacity,
  ])

  useEffect(() => {
    if (!leaving) return
    const done = () => onExited(toast.id, leaving.reason)
    if (hidden || !entered.current) {
      done()
      return
    }
    const { fling } = leaving
    if (fling && !reduceMotion) {
      dragX.value = withTiming(fling.x * 400, LEAVE)
      dragY.value = withTiming(fling.y * 200, LEAVE)
    } else if (!reduceMotion && leaving.reason !== 'opened') {
      y.value = withTiming(-lift * ((height ?? 60) + 24), LEAVE)
    }
    opacity.value = withTiming(0, LEAVE, (finished) => {
      if (finished) scheduleOnRN(done)
    })

    const fallback = setTimeout(done, LEAVE.duration + 200)
    return () => clearTimeout(fallback)
  }, [leaving])

  const shown = useRef(false)
  useEffect(() => {
    if (!readable || !measured || shown.current) return
    if (toast.expiresAt !== undefined && Date.now() > toast.expiresAt) {
      onLeave(toast.id, { reason: 'expired' })
      return
    }
    shown.current = true
    toast.onShow?.()
    const spoken = [toast.eyebrow, toast.title, toast.message]
      .filter(Boolean)
      .join(', ')
    AccessibilityInfo.announceForAccessibility(spoken)
    if (toast.intent === 'unlock') Haptics.success().catch(() => {})
    if (toast.intent === 'error') Haptics.error().catch(() => {})
  }, [readable, measured, toast, onLeave])

  useEffect(() => {
    if (readable || shown.current || toast.expiresAt === undefined) return
    const timer = setTimeout(
      () => onLeave(toast.id, { reason: 'expired' }),
      Math.max(0, toast.expiresAt - Date.now())
    )
    return () => clearTimeout(timer)
  }, [readable, toast, onLeave])

  const [duration, setDuration] = useState<number | null>(null)
  useEffect(() => {
    let cancelled = false
    void toastDuration(toast.intent, screenReader, toast.durationMs).then(
      (ms) => {
        if (!cancelled) setDuration(ms)
      }
    )
    return () => {
      cancelled = true
    }
  }, [toast.intent, toast.durationMs, screenReader])
  const remaining = useRef<number | null>(null)
  useEffect(() => {
    if (duration === null || hidden || paused || leaving || !measured || !front)
      return
    remaining.current ??= duration
    const started = Date.now()
    const timer = setTimeout(
      () => onLeave(toast.id, { reason: 'timeout' }),
      remaining.current
    )
    return () => {
      clearTimeout(timer)
      remaining.current = Math.max(
        0,
        (remaining.current ?? duration) - (Date.now() - started)
      )
    }
  }, [duration, hidden, paused, leaving, measured, front, toast.id, onLeave])

  const open = () => {
    if (!expanded && index !== null && index > 0) {
      onExpand()
      return
    }
    if (!toast.onOpen) return
    toast.onOpen()
    onLeave(toast.id, { reason: 'opened' })
  }

  const swipeAway = (fling: { x: number; y: number }) =>
    onLeave(toast.id, { reason: 'swiped', fling })

  const pan = Gesture.Pan()
    .enabled(!leaving)
    .activeOffsetX([-10, 10])
    .activeOffsetY([-10, 10])
    .onBegin(() => {
      scheduleOnRN(onTouch, true)
    })
    .onUpdate((event) => {
      const away =
        lift === 1
          ? Math.min(0, event.translationY)
          : Math.max(0, event.translationY)
      dragY.value = away + (event.translationY - away) * 0.15
      dragX.value = event.translationX
    })
    .onEnd((event) => {
      const awayDistance = -lift * event.translationY
      const awaySpeed = -lift * event.velocityY
      const side = Math.abs(event.translationX)
      if (
        awayDistance > SWIPE_DISTANCE ||
        (awaySpeed > SWIPE_VELOCITY && awayDistance > 8)
      ) {
        scheduleOnRN(swipeAway, { x: 0, y: -lift })
      } else if (
        side > SWIPE_DISTANCE * 2 ||
        (Math.abs(event.velocityX) > SWIPE_VELOCITY * 1.5 && side > 16)
      ) {
        scheduleOnRN(swipeAway, { x: Math.sign(event.translationX), y: 0 })
      } else {
        dragX.value = reduceMotion
          ? 0
          : withSpring(0, { damping: 20, stiffness: 260 })
        dragY.value = reduceMotion
          ? 0
          : withSpring(0, { damping: 20, stiffness: 260 })
      }
    })
    .onFinalize(() => {
      scheduleOnRN(onTouch, false)
    })
  const tap = Gesture.Tap()
    .enabled(!leaving)
    .onEnd(() => {
      scheduleOnRN(open)
    })

  const takesTap =
    toast.intent === 'unlock' || toast.intent === 'news' || index !== 0
  const gesture = takesTap ? Gesture.Race(pan, tap) : pan

  const cardStyle = useAnimatedStyle(() => ({
    height: cardHeight.value,
    opacity: opacity.value,
    transform: [
      { translateX: dragX.value },
      { translateY: y.value + dragY.value },
      { scale: scale.value },
    ],
  }))
  const contentStyle = useAnimatedStyle(() => ({
    opacity: contentOpacity.value,
  }))

  const surface = toastSurface(toast, theme)
  const unlock = toast.intent === 'unlock'
  const accessibilityLabel = [
    toast.eyebrow,
    toast.title,
    toast.message,
    toast.accessory?.label,
  ]
    .filter(Boolean)
    .join(', ')

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View
        testID={`toast-${toast.intent}`}
        accessible={toast.intent !== 'undo'}
        accessibilityRole={toast.onOpen ? 'button' : 'text'}
        accessibilityLabel={
          toast.intent !== 'undo' ? accessibilityLabel : undefined
        }
        accessibilityHint={toast.onOpen ? i18n.t('toast_openHint') : undefined}
        accessibilityActions={
          toast.intent === 'undo'
            ? undefined
            : [
                ...(toast.onOpen ? [{ name: 'activate' as const }] : []),
                { name: 'dismiss', label: i18n.t('dismiss') },
              ]
        }
        accessibilityElementsHidden={!readable}
        importantForAccessibility={readable ? 'auto' : 'no-hide-descendants'}
        onAccessibilityAction={(event) => {
          if (event.nativeEvent.actionName === 'activate') open()
          if (event.nativeEvent.actionName === 'dismiss')
            onLeave(toast.id, { reason: 'swiped' })
        }}
        style={[
          {
            position: 'absolute',
            start: 0,
            end: 0,
            [placement]: 0,
            zIndex: 100 - (index ?? 50),
            borderRadius: surface.borderRadius,
            borderCurve: 'continuous',
            backgroundColor: surface.backgroundColor,
            borderWidth: unlock || toast.intent === 'news' ? 1 : 0,
            borderColor: surface.borderColor,
            shadowColor: '#000',
            shadowOpacity: 0.16,
            shadowRadius: 14,
            shadowOffset: { width: 0, height: 6 },
            elevation: Math.max(1, 8 - (index ?? 8)),

            transformOrigin: 'top',
          },
          cardStyle,
        ]}
      >
        <View
          style={{
            flex: 1,
            overflow: 'hidden',
            borderRadius: surface.borderRadius,
            borderCurve: 'continuous',
          }}
        >
          <Animated.View
            pointerEvents={collapsedBehind ? 'none' : 'auto'}
            style={[
              { position: 'absolute', start: 0, end: 0, [placement]: 0 },
              contentStyle,
            ]}
            onLayout={(event) =>
              onMeasure(toast.id, Math.ceil(event.nativeEvent.layout.height))
            }
          >
            <PointerHover onHoverChange={setHovered}>
              <View>
                <ToastContent
                  toast={toast}
                  hovered={hovered}
                  onAction={() => {
                    toast.action?.onPress()
                    onLeave(toast.id, { reason: 'action' })
                  }}
                />
              </View>
            </PointerHover>
          </Animated.View>
        </View>
      </Animated.View>
    </GestureDetector>
  )
}
