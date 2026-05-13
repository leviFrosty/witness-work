import LottieView from 'lottie-react-native'
import {
  PropsWithChildren,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react'
import { View } from 'react-native'
import { FullWindowOverlay } from 'react-native-screens'
import {
  AnimationViewContext,
  AnimationViewCtx,
} from '@/contexts/AnimationView'
import confetti from '@/assets/lottie/confetti.json'
import { setAudioModeAsync, useAudioPlayer } from 'expo-audio'
// @ts-expect-error MP3 doesn't export module
import chime from '@/assets/audio/success-chime.mp3'

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
  const player = useAudioPlayer(chime)
  const [overlayMounted, setOverlayMounted] = useState(false)
  const pendingPlayRef = useRef(false)
  const safetyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const playSound = useCallback(() => {
    try {
      setAudioModeAsync({ playsInSilentMode: true })
      player.seekTo(0)
      player.play()
    } catch {
      // Silently fail if audio session cannot be activated
    }
  }, [player])

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
              <LottieView
                autoPlay={false}
                loop={false}
                onAnimationFinish={handleAnimationFinish}
                resizeMode='cover'
                ref={lottieViewRef}
                source={confetti}
                style={{
                  width: '100%',
                  height: '100%',
                }}
              />
            </View>
          </FullWindowOverlay>
        ) : null}
      </View>
    </AnimationViewContext.Provider>
  )
}

export default AnimationViewProvider
