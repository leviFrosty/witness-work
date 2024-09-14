import { PropsWithChildren } from 'react'
import { View, ViewProps } from 'react-native'

interface Props extends ViewProps {}

const XView: React.FC<PropsWithChildren<Props>> = ({
  style,
  children,
  ...props
}) => {
  return (
    <View
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 5,
        },
        [style],
      ]}
      {...props}
    >
      {children}
    </View>
  )
}

export default XView
