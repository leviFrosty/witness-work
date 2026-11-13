import { useState } from 'react'
import { View } from 'react-native'
import QRCode from 'react-native-qrcode-svg'
import Button from '@/components/ui/Button'
import Card from '@/components/ui/Card'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import { shortLink } from '@/features/territories/lib/shortLink'

export default function GuestLinkQrCard({
  url,
  caption,
}: {
  url: string
  caption: string
}) {
  const theme = useTheme()
  const [full, setFull] = useState(false)
  return (
    <Card style={{ alignItems: 'center', gap: 12 }} testID='guest-link-qr-card'>
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
      <Button
        testID='guest-link-url'
        onPress={() => setFull((was) => !was)}
        accessibilityLabel={i18n.t(
          full
            ? 'territories.share.hideFullLink'
            : 'territories.share.showFullLink'
        )}
        style={{
          minHeight: 44,
          maxWidth: '100%',
          paddingHorizontal: 14,
          paddingVertical: 8,
          justifyContent: 'center',
          borderRadius: full ? 14 : 22,
          backgroundColor: theme.colors.backgroundLighter,
        }}
      >
        <Text
          selectable={full}
          numberOfLines={full ? undefined : 1}
          style={{
            textAlign: 'center',
            fontSize: theme.fontSize('sm'),
            color: theme.colors.textAlt,
          }}
        >
          {full ? url : shortLink(url)}
        </Text>
      </Button>
      <Text style={{ textAlign: 'center', color: theme.colors.textAlt }}>
        {caption}
      </Text>
    </Card>
  )
}
