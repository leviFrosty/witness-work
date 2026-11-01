import { View } from 'react-native'
import QRCode from 'react-native-qrcode-svg'

const APP_ICON = require('@/assets/icon.png')

interface Props {
  url: string
  size: number
  accessibilityLabel: string
}

const StoreQrCode = ({ url, size, accessibilityLabel }: Props) => (
  <View
    accessible
    accessibilityRole='image'
    accessibilityLabel={accessibilityLabel}
  >
    <QRCode
      value={url}
      size={size}
      color='#000000'
      backgroundColor='#FFFFFF'
      ecl='H'
      logo={APP_ICON}
      logoSize={size * 0.18}
      logoMargin={3}
      logoBorderRadius={8}
      logoBackgroundColor='#FFFFFF'
    />
  </View>
)

export default StoreQrCode
