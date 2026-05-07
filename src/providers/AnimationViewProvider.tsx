import LottieView from 'lottie-react-native'
import { PropsWithChildren, useCallback, useRef } from 'react'
import { View } from 'react-native'
import { FullWindowOverlay } from 'react-native-screens'
import {
  AnimationViewContext,
  AnimationViewCtx,
} from '../contexts/AnimationView'
import confetti from '../assets/lottie/confetti.json'
import { setAudioModeAsync, useAudioPlayer } from 'expo-audio'
// @ts-expect-error MP3 doesn't export module
import chime from '../assets/audio/success-chime.mp3'

interface Props {}

export const CONFETTI_DURATION = 3000
export const CONFETTI_DELAY_MS = 150

const AnimationViewProvider: React.FC<PropsWithChildren<Props>> = ({
  children,
}) => {
  const lottieViewRef = useRef<LottieView>(null)
  const player = useAudioPlayer(chime)

  const playSound = useCallback(() => {
    try {
      setAudioModeAsync({ playsInSilentMode: true })
      player.seekTo(0)
      player.play()
    } catch {
      // Silently fail if audio session cannot be activated
    }
  }, [player])

  const playConfetti = useCallback(() => {
    lottieViewRef.current?.reset()
    setTimeout(() => {
      playSound()
      lottieViewRef.current?.play(100, 180)
    }, CONFETTI_DELAY_MS)
  }, [playSound])

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
         */}
        <FullWindowOverlay>
          <LottieView
            autoPlay={false}
            loop={false}
            onAnimationFinish={lottieViewRef.current?.reset}
            resizeMode='cover'
            ref={lottieViewRef}
            source={confetti}
            style={{
              position: 'absolute',
              width: '100%',
              height: '100%',
              pointerEvents: 'none',
            }}
          />
        </FullWindowOverlay>
      </View>
    </AnimationViewContext.Provider>
  )
}

export default AnimationViewProvider
