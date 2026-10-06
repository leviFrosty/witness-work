import { View } from 'react-native'
import ActionButton from '@/components/ui/ActionButton'
import Button from '@/components/ui/Button'
import Text from '@/components/ui/MyText'
import XView from '@/components/ui/layout/XView'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import type { ShareReply } from '@/features/buddies/lib/schemas'

/** Going / Can't Make It for a buddy's Plan or Follow-up invitation. */
export default function ShareAnswerButtons({
  disabled,
  onAnswer,
}: {
  disabled: boolean
  onAnswer: (answer: ShareReply) => void
}) {
  const theme = useTheme()
  return (
    <XView style={{ gap: 10 }}>
      <View style={{ flex: 1 }}>
        <ActionButton disabled={disabled} onPress={() => onAnswer('going')}>
          {i18n.t('buddies_going')}
        </ActionButton>
      </View>
      <Button
        disabled={disabled}
        style={{ paddingVertical: 10, paddingHorizontal: 12 }}
        onPress={() => onAnswer('declined')}
      >
        <Text style={{ color: theme.colors.textAlt }}>
          {i18n.t('buddies_cantMakeIt')}
        </Text>
      </Button>
    </XView>
  )
}
