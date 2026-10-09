import { View } from 'react-native'
import LottieView, { LottieViewProps } from 'lottie-react-native'
import i18n from '@/lib/locales'

interface Props extends Omit<LottieViewProps, 'source'> {
  /** What's loading, read by screen readers. Defaults to "Loading". */
  accessibilityLabel?: string
}

/** The animated loading mark, announced to screen readers. */
const Loader = ({ style, accessibilityLabel, ...props }: Props) => {
  return (
    <View
      accessible
      accessibilityRole='progressbar'
      accessibilityLabel={accessibilityLabel ?? i18n.t('common_loading')}
      accessibilityState={{ busy: true }}
    >
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
        source={require('@/assets/lottie/loading.json')}
      />
    </View>
  )
}

export default Loader
