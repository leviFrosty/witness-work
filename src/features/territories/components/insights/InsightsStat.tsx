import { View } from 'react-native'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'

export default function InsightsStat({
  label,
  value,
}: {
  label: string
  value: string
}) {
  const theme = useTheme()
  return (
    <View style={{ flex: 1, gap: 2 }}>
      <Text
        style={{ fontSize: theme.fontSize('sm'), color: theme.colors.textAlt }}
      >
        {label}
      </Text>
      <Text
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.8}
        style={{
          fontFamily: theme.fonts.semiBold,
          fontSize: theme.fontSize('lg'),
        }}
      >
        {value}
      </Text>
    </View>
  )
}
