import { IconProp } from '@fortawesome/fontawesome-svg-core'
import Button from '@/components/Button'
import { Insets, StyleProp, ViewStyle } from 'react-native'
import {
  FontAwesomeIcon,
  FontAwesomeIconStyle,
} from '@fortawesome/react-native-fontawesome'
import { ThemeContext } from '@/contexts/theme'
import { useContext } from 'react'
import { ThemeSizes } from '@/types/theme'

type Props = {
  icon: IconProp
  onPress?: () => void
  size?: ThemeSizes | number
  style?: StyleProp<ViewStyle>
  iconStyle?: FontAwesomeIconStyle
  color?: string
  noTransform?: boolean
  accessibilityLabel?: string
  /**
   * Override the underlying Button's default 10px hitSlop. Set this when two
   * IconButtons sit side-by-side with a small gap — the default slop overlaps
   * and RN resolves overlapping siblings to the last one rendered, so a tap on
   * the inner edge of the first button fires the second.
   */
  hitSlop?: number | Insets
}

const IconButton = ({
  onPress,
  icon,
  style,
  size: _size,
  iconStyle,
  color,
  noTransform,
  accessibilityLabel,
  hitSlop,
}: Props) => {
  const theme = useContext(ThemeContext)
  const size = typeof _size === 'number' ? _size : theme.fontSize(_size)

  return (
    <Button
      style={style}
      noTransform={noTransform ?? !onPress}
      disabled={!onPress}
      onPress={onPress}
      hitSlop={hitSlop}
      accessibilityLabel={accessibilityLabel}
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
