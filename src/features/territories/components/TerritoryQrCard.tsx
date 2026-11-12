import { View } from 'react-native'
import * as Clipboard from 'expo-clipboard'
import QRCode from 'react-native-qrcode-svg'
import { Share as ShareIcon } from 'lucide-react-native'
import Card from '@/components/ui/Card'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import { shareUrl } from '@/lib/share'
import { toast } from '@/stores/toasts'
import TerritoryPill from '@/features/territories/components/TerritoryPill'

export default function TerritoryQrCard({
  value,
  title,
}: {
  value: string
  title: string
}) {
  const theme = useTheme()
  const share = async () => {
    try {
      await shareUrl(value, title)
    } catch {
      await Clipboard.setStringAsync(value)
      toast.success(i18n.t('linkCopied'))
    }
  }

  return (
    <Card style={{ alignItems: 'center', gap: 14 }} testID='territory-qr-card'>
      <View
        accessible
        accessibilityRole='image'
        accessibilityLabel={i18n.t('territories.qrCode_a11y')}
        style={{ padding: 12, borderRadius: 14, backgroundColor: '#FFFFFF' }}
      >
        <QRCode
          value={value}
          size={180}
          color='#000000'
          backgroundColor='#FFFFFF'
          ecl='M'
        />
      </View>
      <Text
        selectable
        numberOfLines={2}
        style={{
          textAlign: 'center',
          color: theme.colors.textAlt,
          fontSize: theme.fontSize('sm'),
        }}
      >
        {value}
      </Text>
      <Text style={{ textAlign: 'center' }}>
        {i18n.t('territories.qrCode_description')}
      </Text>
      <View style={{ alignItems: 'center' }}>
        <TerritoryPill
          icon={ShareIcon}
          iconColor={theme.colors.text}
          surface='background'
          label={i18n.t('territories.share.cardMapShare')}
          onPress={() => void share()}
          testID='territory-card-map-share'
        />
      </View>
    </Card>
  )
}
