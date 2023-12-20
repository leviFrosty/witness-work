import { PropsWithChildren } from 'react'
import { View, ViewStyle, StyleProp } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import useTheme from '../contexts/theme'

interface Props {
  style?: StyleProp<ViewStyle>
  insets?: 'top' | 'bottom' | 'both' | 'none'
}

const Wrapper: React.FC<PropsWithChildren<Props>> = ({
  style,
  children,
  insets = 'both',
}) => {
  const theme = useTheme()
  const deviceInsets = useSafeAreaInsets()

  const getInsets = () => {
    if (insets === 'none') return
    if (insets === 'top') {
      return {
        paddingTop: deviceInsets.top,
      }
    }
    if (insets === 'bottom') {
      return {
        paddingBottom: deviceInsets.bottom,
      }
    }
    return {
      paddingTop: deviceInsets.top,
      paddingBottom: deviceInsets.bottom,
    }
  }

  return (
    <View
      style={[
        [
          {
            ...getInsets(),
            flexGrow: 1,
            backgroundColor: theme.colors.background,
          },
        ],
        [style],
      ]}
    >
      {children}
    </View>
  )
}
export default Wrapper
