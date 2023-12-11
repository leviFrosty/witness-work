import { PropsWithChildren } from 'react'
import { View, ViewStyle, StyleProp } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import useTheme from '../contexts/theme'

interface Props {
  style?: StyleProp<ViewStyle>
  noInsets?: boolean
}

const Wrapper: React.FC<PropsWithChildren<Props>> = ({
  noInsets,
  style,
  children,
}) => {
  const theme = useTheme()
  const insets = useSafeAreaInsets()

  return (
    <View
      style={[
        [
          {
            backgroundColor: theme.colors.background,
            paddingTop: noInsets ? 0 : insets.top,
            paddingBottom: noInsets ? 0 : insets.bottom + 25,
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
