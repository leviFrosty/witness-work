import LottieView from 'lottie-react-native'
import { BlurView } from 'expo-blur'
import { Modal } from 'react-native'

const FullScreenLoader = () => {
  return (
    <Modal transparent>
      <BlurView
        style={{
          width: '100%',
          height: '100%',
          position: 'absolute',
          left: 0,
          top: 0,
          zIndex: 100000,
        }}
      >
        <LottieView
          autoPlay
          loop={true}
          style={{
            width: '100%',
          }}
          source={require('./../assets/lottie/loading.json')}
        />
      </BlurView>
    </Modal>
  )
}

export default FullScreenLoader
