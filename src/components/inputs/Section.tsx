import { PropsWithChildren } from 'react'
import { View, ViewProps } from 'react-native'
import useTheme from '../../contexts/theme'
import { rowPaddingVertical } from '../../constants/Inputs'

interface Props extends ViewProps {
  noPadding?: boolean
}

const Section: React.FC<PropsWithChildren<Props>> = ({
  children,
  noPadding,
  style,
  ...props
}) => {
  const theme = useTheme()

  return (
    <View
      style={[
        {
          borderColor: theme.colors.border,
          borderTopWidth: 2,
          borderBottomWidth: 2,
          backgroundColor: theme.colors.backgroundLighter,
          paddingVertical: rowPaddingVertical,
          paddingLeft: noPadding ? 0 : 25,
          gap: 10,
          paddingRight: noPadding ? 0 : 3,
        },
        [style],
      ]}
      {...props}
    >
      {children}
    </View>
  )
}

export default Section
