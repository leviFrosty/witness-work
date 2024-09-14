import LottieView from 'lottie-react-native'
import {
  PropsWithChildren,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react'
import { View } from 'react-native'
import {
  AnimationViewContext,
  AnimationViewCtx,
} from '../contexts/AnimationView'
import confetti from '../assets/lottie/confetti.json'
import { Audio } from 'expo-av'
// @ts-expect-error MP3 doesn't export module
import chime from '../assets/audio/success-chime.mp3'

interface Props {}

export const CONFETTI_ANIMATE_DURATION = 3000

const AnimationViewProvider: React.FC<PropsWithChildren<Props>> = ({
  children,
}) => {
  const lottieViewRef = useRef<LottieView>(null)
  const [sound, setSound] = useState<Audio.Sound>()

  async function playSound() {
    const { sound } = await Audio.Sound.createAsync(chime)
    setSound(sound)
    await sound.playAsync()
  }

  useEffect(() => {
    return sound
      ? () => {
          sound.unloadAsync()
        }
      : undefined
  }, [sound])

  const playConfetti = useCallback(() => {
    lottieViewRef.current?.reset()
    setTimeout(() => {
      playSound()
      lottieViewRef.current?.play(100, 180)
    }, 200)
  }, [])

  const ctx: AnimationViewCtx = {
    playConfetti,
  }

  return (
    <AnimationViewContext.Provider value={ctx}>
      <View style={{ position: 'relative', flex: 1 }}>
        {children}
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
      </View>
    </AnimationViewContext.Provider>
  )
}

export default AnimationViewProvider
