import type LottieView from 'lottie-react-native'
import {
  PropsWithChildren,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react'
import { View } from 'react-native'
import FullWindowOverlay from '@/components/ui/FullWindowOverlay'
import {
  AnimationViewContext,
  AnimationViewCtx,
} from '@/contexts/AnimationView'
import { useLazySound } from '@/lib/audio'

interface Props {}

export const CONFETTI_DURATION = 3000
export const CONFETTI_DELAY_MS = 150

/**
 * Hard upper bound for keeping the FullWindowOverlay mounted past the scheduled
 * animation length. Acts as a safety net if `onAnimationFinish` never fires
 * (e.g. unmount mid-play, lottie bug). Keeping the overlay around indefinitely
 * would silently break native sheets/pickers below it.
 */
const ANIMATION_SAFETY_MS = CONFETTI_DELAY_MS + CONFETTI_DURATION + 1000

const AnimationViewProvider: React.FC<PropsWithChildren<Props>> = ({
  children,
}) => {
  const lottieViewRef = useRef<LottieView>(null)
  // Created on the first celebration, not at launch.
  const playSound = useLazySound('successChime')
  const [overlayMounted, setOverlayMounted] = useState(false)
  const pendingPlayRef = useRef(false)
  const safetyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearSafety = useCallback(() => {
    if (safetyTimerRef.current) {
      clearTimeout(safetyTimerRef.current)
      safetyTimerRef.current = null
    }
  }, [])

  const armSafety = useCallback(() => {
    clearSafety()
    safetyTimerRef.current = setTimeout(() => {
      safetyTimerRef.current = null
      setOverlayMounted(false)
    }, ANIMATION_SAFETY_MS)
  }, [clearSafety])

  const playSequence = useCallback(() => {
    lottieViewRef.current?.reset()
    setTimeout(() => {
      playSound()
      lottieViewRef.current?.play(100, 180)
    }, CONFETTI_DELAY_MS)
  }, [playSound])

  const playConfetti = useCallback(() => {
    armSafety()
    if (overlayMounted) {
      // LottieView ref is already attached — replay immediately.
      playSequence()
      return
    }
    pendingPlayRef.current = true
    setOverlayMounted(true)
  }, [armSafety, overlayMounted, playSequence])

  /**
   * Drains the pending play once the FullWindowOverlay finishes mounting and
   * the LottieView ref attaches. Without this two-step, the first call after an
   * idle period would no-op because `lottieViewRef.current` is null when
   * `playConfetti` runs.
   */
  useEffect(() => {
    if (!overlayMounted) return
    if (!pendingPlayRef.current) return
    pendingPlayRef.current = false
    playSequence()
  }, [overlayMounted, playSequence])

  useEffect(() => () => clearSafety(), [clearSafety])

  const handleAnimationFinish = useCallback(() => {
    clearSafety()
    lottieViewRef.current?.reset()
    setOverlayMounted(false)
  }, [clearSafety])

  const ctx: AnimationViewCtx = {
    playConfetti,
  }

  return (
    <AnimationViewContext.Provider value={ctx}>
      <View style={{ position: 'relative', flex: 1 }}>
        {children}
        {/*
         * Mounted at the UIWindow level so the celebration renders above
         * any pushed/modal screens (e.g. the Paywall Thank You screen),
         * not as a sibling of the navigator that pushed screens can occlude.
         *
         * Conditional mount: an always-mounted FullWindowOverlay attaches a
         * touch handler to a UIWindow-level container that has been observed
         * to interfere with natively presented sheets (Share, UIColorPicker)
         * even with `pointerEvents="none"` set on the inner content. Mounting
         * only during playback removes the surface entirely while idle.
         */}
        {overlayMounted ? (
          <ConfettiLottie
            lottieViewRef={lottieViewRef}
            onAnimationFinish={handleAnimationFinish}
          />
        ) : null}
      </View>
    </AnimationViewContext.Provider>
  )
}

/**
 * The overlay's Lottie view and its 290 KB animation, required the first time a
 * celebration plays rather than at launch.
 */
function ConfettiLottie({
  lottieViewRef,
  onAnimationFinish,
}: {
  lottieViewRef: React.RefObject<LottieView | null>
  onAnimationFinish: () => void
}) {
  const Lottie: typeof LottieView = require('lottie-react-native').default
  return (
    <FullWindowOverlay>
      <View
        pointerEvents='none'
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
        }}
      >
        <Lottie
          autoPlay={false}
          loop={false}
          onAnimationFinish={onAnimationFinish}
          resizeMode='cover'
          ref={lottieViewRef}
          source={require('@/assets/lottie/confetti.json')}
          style={{
            width: '100%',
            height: '100%',
          }}
        />
      </View>
    </FullWindowOverlay>
  )
}

export default AnimationViewProvider
