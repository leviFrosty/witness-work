import LottieView, { AnimatedLottieViewProps } from 'lottie-react-native'

interface Props extends Omit<AnimatedLottieViewProps, 'source'> {}

const Loader = ({ style, ...props }: Props) => {
  return (
    <LottieView
      autoPlay
      loop={true}
      style={[
        [
          {
            height: 20,
            width: 20,
          },
        ],
        [style],
      ]}
      {...props}
      source={require('./../assets/lottie/loading.json')}
    />
  )
}

export default Loader
