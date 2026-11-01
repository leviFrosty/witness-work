import { View } from 'react-native'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'

export default function HomeEmptySectionPlaceholder({
  title,
}: {
  title: string
}) {
  const theme = useTheme()
  return (
    <View
      style={{
        paddingVertical: 16,
        paddingHorizontal: 20,
        gap: 2,
        borderRadius: theme.numbers.borderRadiusLg,
        borderWidth: 1.5,
        borderStyle: 'dashed',
        borderColor: theme.colors.border,
      }}
    >
      <Text style={{ fontFamily: theme.fonts.semiBold }}>{title}</Text>
      <Text
        style={{
          fontSize: theme.fontSize('xs'),
          color: theme.colors.textAlt,
        }}
      >
        {i18n.t('homeEdit.emptySection')}
      </Text>
    </View>
  )
}
