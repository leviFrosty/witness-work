import { Sheet } from 'tamagui'
import Text from './MyText'
import i18n from '../lib/locales'
import Button from './Button'
import { Share, View } from 'react-native'
import IconButton from './IconButton'
import { faApple, faGoogle } from '@fortawesome/free-brands-svg-icons'
import useTheme from '../contexts/theme'

export type MapShareSheet = {
  open: boolean
  appleMapsUri: string
  googleMapsUri: string
}

interface Props {
  sheet: MapShareSheet
  setSheet: React.Dispatch<React.SetStateAction<MapShareSheet>>
}

const ShareAddressSheet = ({ sheet, setSheet }: Props) => {
  const theme = useTheme()

  const handleShare = (service: 'apple' | 'google') => {
    if (service === 'apple') {
      Share.share({ url: sheet.appleMapsUri, message: sheet.appleMapsUri })
    }

    if (service === 'google') {
      Share.share({ url: sheet.googleMapsUri, message: sheet.googleMapsUri })
    }

    setSheet({
      open: false,
      appleMapsUri: '',
      googleMapsUri: '',
    })
  }

  return (
    <Sheet
      open={sheet.open}
      onOpenChange={(o: boolean) => setSheet({ ...sheet, open: o })}
      dismissOnSnapToBottom
      modal
      snapPoints={[50]}
    >
      <Sheet.Handle />
      <Sheet.Overlay zIndex={100_000 - 1} />
      <Sheet.Frame>
        <View style={{ padding: 30, gap: 10 }}>
          <View style={{ marginBottom: 10, gap: 5 }}>
            <Text
              style={{
                color: theme.colors.text,
                fontSize: theme.fontSize('xl'),
                fontFamily: theme.fonts.bold,
              }}
            >
              {i18n.t('shareAddress')}
            </Text>
            <Text
              style={{
                fontSize: theme.fontSize('sm'),
                color: theme.colors.textAlt,
              }}
            >
              {i18n.t('generateAUrlFromYourPreferredMappingService')}
            </Text>
          </View>
          <Button
            variant='solid'
            style={{ gap: 10, backgroundColor: theme.colors.card }}
            onPress={() => handleShare('apple')}
          >
            <IconButton
              icon={faApple}
              iconStyle={{ color: theme.colors.text }}
            />
            <Text style={{ color: theme.colors.text }}>
              {i18n.t('appleMaps')}
            </Text>
          </Button>
          <Button
            style={{ gap: 10, backgroundColor: theme.colors.card }}
            variant='solid'
            onPress={() => handleShare('google')}
          >
            <IconButton
              iconStyle={{ color: theme.colors.text }}
              icon={faGoogle}
            />
            <Text style={{ color: theme.colors.text }}>
              {i18n.t('googleMaps')}
            </Text>
          </Button>
        </View>
      </Sheet.Frame>
    </Sheet>
  )
}

export default ShareAddressSheet
