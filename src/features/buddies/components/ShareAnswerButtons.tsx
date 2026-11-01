import { View } from 'react-native'
import ActionButton from '@/components/ui/ActionButton'
import Button from '@/components/ui/Button'
import Text from '@/components/ui/MyText'
import XView from '@/components/ui/layout/XView'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import type { ShareReply } from '@/features/buddies/lib/schemas'

export default function ShareAnswerButtons({
  disabled,
  onAnswer,
  plan,
}: {
  disabled: boolean
  onAnswer: (answer: ShareReply) => void

  plan?: boolean
}) {
  const theme = useTheme()
  const buttons = (
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
  if (!plan) return buttons
  return (
    <View style={{ gap: 6 }}>
      {buttons}
      <Text
        style={{ color: theme.colors.textAlt, fontSize: theme.fontSize('sm') }}
      >
        {i18n.t('planDetails_invitedSeeWhosGoing')}
      </Text>
    </View>
  )
}
