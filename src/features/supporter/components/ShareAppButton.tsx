import { Share } from 'react-native'
import useTheme from '../../../contexts/theme'
import Button from '../../../components/Button'
import links from '../../../constants/links'
import Text from '../../../components/MyText'
import i18n from '../../../lib/locales'

const ShareAppButton = () => {
  const theme = useTheme()
  return (
    <Button
      onPress={() =>
        Share.share({
          url: links.appStore,
        })
      }
    >
      <Text
        style={{
          textDecorationLine: 'underline',
          fontSize: theme.fontSize('sm'),
        }}
      >
        {i18n.t('shareApp')}
      </Text>
    </Button>
  )
}

export default ShareAppButton
