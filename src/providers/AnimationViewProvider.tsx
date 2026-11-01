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
import useReduceMotionEnabled from '@/hooks/useReduceMotionEnabled'
import { useLazySound } from '@/lib/audio'

interface Props {}

export const CONFETTI_DURATION = 3000
export const CONFETTI_DELAY_MS = 150

const ANIMATION_SAFETY_MS = CONFETTI_DELAY_MS + CONFETTI_DURATION + 1000

const AnimationViewProvider: React.FC<PropsWithChildren<Props>> = ({
  children,
}) => {
  const lottieViewRef = useRef<LottieView>(null)

  const playSound = useLazySound('successChime')
  const reduceMotion = useReduceMotionEnabled()
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
    if (reduceMotion) {
      setTimeout(playSound, CONFETTI_DELAY_MS)
      return
    }
    armSafety()
    if (overlayMounted) {
      playSequence()
      return
    }
    pendingPlayRef.current = true
    setOverlayMounted(true)
  }, [armSafety, overlayMounted, playSequence, playSound, reduceMotion])

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
        {}
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
