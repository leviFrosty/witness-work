import { IconProp } from '@fortawesome/fontawesome-svg-core'
import useTheme from '../../../../contexts/theme'
import Card from '../../../Card'
import IconButton from '../../../IconButton'
import Text from '../../../MyText'
import i18n, { TranslationKey } from '../../../../lib/locales'

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
        flex: 1,
        minWidth: '45%',
        gap: 10,
        // width: '50%',
      }}
    >
      <IconButton icon={props.icon} color={theme.colors.text} size={'2xl'} />
      <Text>{i18n.t(props.title)}</Text>
      <Text>{i18n.t(props.text)}</Text>
    </Card>
  )
}
