import { View } from 'react-native'
import ActionButton from '@/components/ui/ActionButton'
import Button from '@/components/ui/Button'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'

export default function AnswerButtons({
  sending,
  onYes,
  onNo,
  testIDPrefix,
}: {
  sending: boolean
  onYes: () => void
  onNo: () => void
  testIDPrefix: string
}) {
  const theme = useTheme()
  return (
    <View style={{ flexDirection: 'row', gap: 12, marginTop: 24 }}>
      {}
      <View style={{ flex: 1 }}>
        <Button
          variant='outline'
          onPress={onNo}
          disabled={sending}
          style={{
            justifyContent: 'center',

            paddingVertical: 11,
            borderRadius: theme.numbers.borderRadiusSm,
            opacity: sending ? 0.5 : 1,
          }}
          testID={`${testIDPrefix}-decline`}
        >
          <Text
            style={{
              fontSize: theme.fontSize('lg'),
              fontFamily: theme.fonts.bold,
            }}
          >
            {i18n.t('handoff_dontAllow')}
          </Text>
        </Button>
      </View>
      <View style={{ flex: 1 }}>
        <ActionButton
          onPress={onYes}
          submitShortcut={false}
          loading={sending}
          disabled={sending}
          testID={`${testIDPrefix}-allow`}
        >
          {i18n.t('handoff_allow')}
        </ActionButton>
      </View>
    </View>
  )
}
