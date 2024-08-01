import useTheme from '../contexts/theme'
import i18n from '../lib/locales'
import Text from './MyText'

export default function CreditBadge() {
  const theme = useTheme()
  return (
    <Text
      style={{
        borderColor: theme.colors.textAlt,
        borderWidth: 1,
        color: theme.colors.textAlt,
        borderRadius: theme.numbers.borderRadiusSm,
        paddingVertical: 1,
        paddingHorizontal: 6,
        fontFamily: theme.fonts.semiBold,
        fontSize: theme.fontSize('xs'),
      }}
    >
      {i18n.t('credit')}
    </Text>
  )
}
