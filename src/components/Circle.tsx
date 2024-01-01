import { View, ViewProps } from 'react-native'
import { ThemeSizes } from '../types/theme'
import useTheme from '../contexts/theme'

interface CircleProps extends ViewProps {
  color: string
  size?: ThemeSizes | number
}

const Circle = ({ color, style, size, ...props }: CircleProps) => {
  const theme = useTheme()

  return (
    <View
      style={[
        {
          width:
            typeof size === 'string' ? theme.fontSize(size) : size ? size : 8,
          height:
            typeof size === 'string' ? theme.fontSize(size) : size ? size : 8,
          backgroundColor: color,
          borderRadius: 100,
        },
        [style],
      ]}
      {...props}
    />
  )
}

export default Circle
