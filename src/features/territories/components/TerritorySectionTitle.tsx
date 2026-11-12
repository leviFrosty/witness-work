import { View } from 'react-native'
import InfoPopover from '@/components/ui/InfoPopover'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'

export default function TerritorySectionTitle({
  children,
  info,
}: {
  children: string

  info?: string
}) {
  const theme = useTheme()
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        marginLeft: 5,
      }}
    >
      <Text
        accessibilityRole='header'
        style={{
          fontFamily: theme.fonts.semiBold,
          color: theme.colors.textAlt,
        }}
      >
        {children}
      </Text>
      {info && <InfoPopover title={children} description={info} inline />}
    </View>
  )
}
