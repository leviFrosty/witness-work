import LottieView from 'lottie-react-native'
import { PropsWithChildren, useCallback, useRef } from 'react'
import { View } from 'react-native'
import {
  AnimationViewContext,
  AnimationViewCtx,
} from '../contexts/AnimationView'
import Haptics from '../lib/haptics'
import confetti from '../assets/lottie/confetti.json'

interface Props {}

export const CONFETTI_ANIMATE_DURATION = 3000

const AnimationViewProvider: React.FC<PropsWithChildren<Props>> = ({
  children,
}) => {
  const lottieViewRef = useRef<LottieView>(null)

  const playConfetti = useCallback(() => {
    lottieViewRef.current?.play(100, 1000)
    Haptics.success()
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
          duration={4000}
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
