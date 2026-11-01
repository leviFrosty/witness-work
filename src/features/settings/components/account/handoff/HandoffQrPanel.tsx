import { useWindowDimensions, View } from 'react-native'
import QRCode from 'react-native-qrcode-svg'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import useFullBrightness from '@/hooks/useFullBrightness'
import i18n from '@/lib/locales'
import { localizeAppDigits } from '@/lib/numbers'
import { useHandoffCountdown } from '@/features/settings/hooks/useHandoffSession'
import { HandoffTextButton } from '@/features/settings/components/account/handoff/HandoffStatus'

const MAX_QR = 320

const countdown = (ms: number) => {
  const seconds = Math.ceil(ms / 1000)
  return localizeAppDigits(
    `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
  )
}

export default function HandoffQrPanel({
  link,
  expiresAt,
  onNewCode,
}: {
  link: string
  expiresAt: number
  onNewCode: () => void
}) {
  const theme = useTheme()
  const { width } = useWindowDimensions()
  const size = Math.min(width - 96, MAX_QR)
  const left = useHandoffCountdown(expiresAt)

  useFullBrightness()

  return (
    <View style={{ alignItems: 'center', gap: 18 }}>
      <View
        accessible
        accessibilityRole='image'
        accessibilityLabel={i18n.t('handoff_qrLabel')}
        testID='handoff-qr'
        style={{
          padding: 16,
          borderRadius: theme.numbers.borderRadiusLg,
          backgroundColor: '#FFFFFF',
        }}
      >
        <QRCode
          value={link}
          size={size}
          color='#000000'
          backgroundColor='#FFFFFF'
          ecl='M'
        />
      </View>
      <Text
        style={{
          textAlign: 'center',
          maxWidth: 320,
          fontSize: theme.fontSize('md'),
        }}
      >
        {i18n.t('handoff_scanInstruction')}
      </Text>
      {left !== null && (
        <Text
          testID='handoff-expires'
          style={{
            color: theme.colors.textAlt,
            fontSize: theme.fontSize('sm'),
            fontVariant: ['tabular-nums'],
          }}
        >
          {i18n.t('handoff_expiresIn', { time: countdown(left) })}
        </Text>
      )}
      <HandoffTextButton
        label={i18n.t('handoff_newCode')}
        onPress={onNewCode}
        testID='handoff-new-code'
      />
    </View>
  )
}
