import { IconProp } from '@fortawesome/fontawesome-svg-core'
import useTheme from '../../../../contexts/theme'
import Card from '../../../Card'
import IconButton from '../../../IconButton'
import Text from '../../../MyText'
import i18n, { TranslationKey } from '../../../../lib/locales'
import { View } from 'react-native'

export default function FeatureCard(props: {
  icon: IconProp
  title: TranslationKey
  text: TranslationKey
}) {
  const theme = useTheme()

  return (
    <Card
      style={{
        borderRadius: theme.numbers.borderRadiusSm,
        borderColor: theme.colors.accent,
        flex: 1,
        minWidth: '45%',
        gap: 15,
        paddingHorizontal: 12,
        paddingVertical: 15,
      }}
    >
      <IconButton icon={props.icon} color={theme.colors.text} size={'2xl'} />
      <View style={{ gap: 5 }}>
        <Text style={{ fontFamily: theme.fonts.bold }}>
          {i18n.t(props.title)}
        </Text>
        <Text style={{ fontSize: theme.fontSize('sm') }}>
          {i18n.t(props.text)}
        </Text>
      </View>
    </Card>
  )
}
