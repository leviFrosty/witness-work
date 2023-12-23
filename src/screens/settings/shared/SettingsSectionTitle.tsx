import Text from '../../../components/MyText'
import useTheme from '../../../contexts/theme'

export const SettingsSectionTitle = ({ text }: { text: string }) => {
  const theme = useTheme()

  return (
    <Text
      style={{
        marginLeft: 20,
        fontFamily: theme.fonts.semiBold,
        fontSize: 12,
        color: theme.colors.textAlt,
        textTransform: 'uppercase',
      }}
    >
      {text}
    </Text>
  )
}

export default SettingsSectionTitle
