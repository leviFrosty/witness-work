import { type StyleProp, View, type ViewStyle } from 'react-native'
import useTheme from '@/contexts/theme'

interface Props {
  visible: boolean
  size?: number
  /** Dot fill; defaults to the unread/info blue. Pass `warn` for in-progress. */
  color?: string
  style?: StyleProp<ViewStyle>
}

/** Consistent unread-style indicator for Notes Imports awaiting review. */
const NotesImportReadyDot = ({ visible, size = 8, color, style }: Props) => {
  const theme = useTheme()

  if (!visible) return null

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility='no-hide-descendants'
      style={[
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: color ?? theme.colors.info,
        },
        style,
      ]}
    />
  )
}

export default NotesImportReadyDot
