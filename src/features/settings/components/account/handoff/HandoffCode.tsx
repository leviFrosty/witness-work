import { Platform, View } from 'react-native'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import { formatHandoffCode } from '@/lib/serverAccount/handoff'
import i18n from '@/lib/locales'

const MONO = Platform.select({ ios: 'Menlo', default: 'monospace' })

export default function HandoffCode({ code }: { code: string }) {
  const theme = useTheme()
  const shown = formatHandoffCode(code)
  return (
    <View
      accessible
      accessibilityLabel={i18n.t('handoff_codeLabel', {
        code: code.split('').join(' '),
      })}
      testID='handoff-code'
      style={{
        paddingVertical: 14,
        paddingHorizontal: 24,
        borderRadius: theme.numbers.borderRadiusLg,
        backgroundColor: theme.colors.card,
        borderWidth: 1,
        borderColor: theme.colors.border,
      }}
    >
      <Text
        maxFontSizeMultiplier={1.4}
        style={{
          fontFamily: MONO,
          fontSize: 40,

          letterSpacing: 4,
          fontWeight: '600',
          textAlign: 'center',
        }}
      >
        {shown}
      </Text>
    </View>
  )
}
