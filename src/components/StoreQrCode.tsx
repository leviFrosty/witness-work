import { View } from 'react-native'
import QRCode from 'react-native-qrcode-svg'

const APP_ICON = require('@/assets/icon.png')

interface Props {
  /** The store link the code opens. */
  url: string
  size: number
  accessibilityLabel: string
}

/**
 * A scannable link to WitnessWork in a store, with the app icon at its centre.
 * Always black on white: inverted or tinted codes scan unreliably on older
 * phones. Give it a white surround — that's the quiet zone scanners need.
 */
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
      // High error correction so the covered center still scans.
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
