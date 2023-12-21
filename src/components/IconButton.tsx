import { IconProp } from '@fortawesome/fontawesome-svg-core'
import Button from './Button'
import { StyleProp, ViewStyle } from 'react-native'
import {
  FontAwesomeIcon,
  FontAwesomeIconStyle,
} from '@fortawesome/react-native-fontawesome'
import { ThemeContext } from '../contexts/theme'
import { useContext } from 'react'
import { ThemeSizes } from '../types/theme'

type Props = {
  icon: IconProp
  onPress?: () => void
  size?: ThemeSizes | number
  style?: StyleProp<ViewStyle>
  iconStyle?: FontAwesomeIconStyle
  color?: string
}

const IconButton = ({
  onPress,
  icon,
  style,
  size: _size,
  iconStyle,
  color,
}: Props) => {
  const theme = useContext(ThemeContext)
  const size = typeof _size === 'number' ? _size : theme.fontSize(_size)

  return (
    <Button
      style={style}
      noTransform={!onPress}
      disabled={!onPress}
      onPress={onPress}
    >
      <FontAwesomeIcon
        icon={icon}
        style={[[{ color: color || theme.colors.textAlt }], [iconStyle]]}
        size={size}
      />
    </Button>
  )
}

export default IconButton
