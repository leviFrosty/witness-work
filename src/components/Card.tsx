import { PropsWithChildren } from 'react'
import { View, StyleProp, ViewStyle } from 'react-native'
import useTheme from '../contexts/theme'

interface Props {
  flexDirection?:
    | 'row'
    | 'column'
    | 'row-reverse'
    | 'column-reverse'
    | undefined
  style?: StyleProp<ViewStyle>
}

const Card: React.FC<PropsWithChildren<Props>> = ({
  children,
  flexDirection,
  style,
}) => {
  const theme = useTheme()

  return (
    <View
      style={[
        [
          {
            borderRadius: theme.numbers.borderRadiusLg,
            backgroundColor: theme.colors.card,
            paddingVertical: 20,
            paddingHorizontal: 20,
            gap: 15,
            shadowOffset: { width: 0, height: 1 },
            shadowColor: theme.colors.shadow,
            shadowOpacity: theme.numbers.shadowOpacity,
            flexDirection: flexDirection || 'column',
          },
        ],
        [style],
      ]}
    >
      {children}
    </View>
  )
}

export default Card
