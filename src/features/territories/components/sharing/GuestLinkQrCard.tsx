import { View } from 'react-native'
import QRCode from 'react-native-qrcode-svg'
import Card from '@/components/ui/Card'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'

export default function GuestLinkQrCard({
  url,
  caption,
}: {
  url: string
  caption: string
}) {
  const theme = useTheme()
  return (
    <Card style={{ alignItems: 'center', gap: 14 }} testID='guest-link-qr-card'>
      <View
        accessible
        accessibilityRole='image'
        accessibilityLabel={i18n.t('territories.share.guestQr_a11y')}
        style={{ padding: 12, borderRadius: 14, backgroundColor: '#FFFFFF' }}
      >
        <QRCode
          value={url}
          size={200}
          color='#000000'
          backgroundColor='#FFFFFF'
          ecl='M'
        />
      </View>
      <Text
        selectable
        style={{
          textAlign: 'center',
          fontFamily: theme.fonts.semiBold,
        }}
      >
        {url}
      </Text>
      <Text style={{ textAlign: 'center', color: theme.colors.textAlt }}>
        {caption}
      </Text>
    </Card>
  )
}
