import type {
  LucideIcon as LucideIconComponent,
  LucideProps,
} from 'lucide-react-native'
import { StyleProp, StyleSheet, TextStyle } from 'react-native'

export type AppIcon = LucideIconComponent
export type AppIconStyle = StyleProp<TextStyle>

type Props = Omit<LucideProps, 'color' | 'style'> & {
  icon: AppIcon
  color?: string
  style?: AppIconStyle
}

const LucideIcon = ({ icon: Icon, color, style, ...props }: Props) => {
  const styleColor = StyleSheet.flatten(style)?.color

  return (
    <Icon
      color={color ?? styleColor}
      style={style as LucideProps['style']}
      {...props}
    />
  )
}

export default LucideIcon
