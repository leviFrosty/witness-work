import { View } from 'react-native'
import Text from '@/components/ui/MyText'
import InfoPopover from '@/components/ui/InfoPopover'
import useTheme from '@/contexts/theme'
import {
  drawerLayout,
  inputLayout,
  useInputLayout,
} from '@/components/ui/inputs/InputLayout'

export const SectionTitle = ({
  text,
  info,
}: {
  text: string
  info?: string
}) => {
  const theme = useTheme()
  const layout = useInputLayout()
  const isDrawer = layout === 'drawer'

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        marginLeft: isDrawer
          ? drawerLayout.horizontalPadding +
            drawerLayout.iconSize +
            drawerLayout.labelGap
          : inputLayout.horizontalPadding,
        marginRight: isDrawer
          ? drawerLayout.horizontalPadding
          : inputLayout.horizontalPadding,
        marginBottom: isDrawer ? 4 : 8,
      }}
    >
      <Text
        accessibilityRole='header'
        style={{
          flexShrink: 1,
          fontFamily: theme.fonts.semiBold,
          fontSize: isDrawer ? theme.fontSize('sm') + 1 : theme.fontSize('md'),
          color: isDrawer ? theme.colors.text : theme.colors.textAlt,
          opacity: isDrawer ? 0.75 : 1,
          letterSpacing: isDrawer ? 0.8 : 0,
          textTransform: isDrawer ? 'uppercase' : 'none',
        }}
      >
        {text}
      </Text>
      {info && <InfoPopover title={text} description={info} inline />}
    </View>
  )
}

export default SectionTitle
