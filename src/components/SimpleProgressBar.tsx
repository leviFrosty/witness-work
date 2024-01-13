import { View } from 'react-native'
import useTheme from '../contexts/theme'

interface SimpleProgressBarProps {
  /**
   * Provide a number between 0 and 1.
   *
   * @example
   *   // To display 25%
   *   0.25
   */
  percentage: number
  color?: string
  height?: number
  width?: number
}

const SimpleProgressBar = ({
  percentage,
  color,
  height,
  width,
}: SimpleProgressBarProps) => {
  const theme = useTheme()

  return (
    <View
      style={{
        backgroundColor: theme.colors.background,
        overflow: 'hidden',
        borderRadius: theme.numbers.borderRadiusMd,
        width: width ?? '100%',
      }}
    >
      <View
        style={{
          backgroundColor: color ?? theme.colors.accent,
          height: height ?? 20,
          width: `${percentage * 100}%`,
        }}
      />
    </View>
  )
}

export default SimpleProgressBar
