import { Share } from 'react-native'
import useTheme from '../contexts/theme'
import useDevice from '../hooks/useDevice'
import Button from './Button'
import links from '../constants/links'
import Text from './MyText'
import i18n from '../lib/locales'

const ShareAppButton = () => {
  const { isAndroid } = useDevice()
  const theme = useTheme()
  return (
    <Button
      onPress={() =>
        Share.share({
          message: isAndroid ? links.playStore : links.appStore,
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
